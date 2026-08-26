'use client';

  // ============================================================================
  // CHANGES IN THIS FILE (search "R1A01 REAL DATA" / "R1A02 REAL DATA" /
  // "R1A03 REAL DATA" to find every touch point):
  //
  // This is the file actually rendered at /dashboard/reports (confirmed —
  // CategoryPanel.tsx, which was edited earlier, is not what's in use).
  //
  // R1A01 (Account Activity By ID) follows the exact same real-data
  // pattern already built here for R1A081-R1A085 (journal entries): a raw
  // fetch() using API_URL + the localStorage token, wired to the Preview
  // button, with its own filter state and loading/error handling.
  //
  // R1A02 (List of Unposted Entries) follows the same pattern with its own
  // dedicated filter card (real Journal + Period From/To dropdowns).
  //
  // R1A03 (Cash Position — CIB) is new in this pass. It reuses R1A01's
  // Chart of Accounts dropdown and R1A02's Accounting Periods dropdown
  // (deduped to distinct years), and calls a new backend endpoint,
  // /approval/reports/cash-position-cib/, wrapping rssys.rpt_a103_cib().
  // This is an INTERIM SCOPE report — transaction detail + optional
  // "Balance Forwarded" row only. It does NOT show bank-vs-books
  // reconciliation totals, since the tables/function for that don't exist
  // in the backend. See reports.py's Cash_Position_CIB docstring for the
  // full explanation. Unlike R1A01, Account ID is REQUIRED here (the
  // backend 400s without one) — the Preview button stays disabled until an
  // account is selected.
  //
  // Dates default to today on open (formatLocalDate, same PHT/UTC-shift fix
  // used elsewhere in this codebase).
  //
  // Nothing about R1A081-R1A085 or any other report was touched.
  // ============================================================================

  import { useEffect, useMemo, useRef, useState } from 'react';
  import {
    ChevronRight,
    Building2,
    Boxes,
    ShoppingCart,
    Users,
    FileText,
    BookOpen,
    Search,
    Eye,
    RotateCcw,
    ArrowLeft,
  } from 'lucide-react';
  import * as XLSX from 'xlsx';

  import { reportsData } from './reports-data';
  import { Card, CardContent } from '@/components/ui/card';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { Checkbox } from '@/components/ui/checkbox';
  import { getApiUrl } from '@/lib/api-config';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';

  const groupIcons = {
    accounting: Building2,
    inventory: Boxes,
    sales: ShoppingCart,
    crm: Users,
  };

  const groupTheme: Record<
    string,
    { chip: string; card: string; text: string }
  > = {
    accounting: {
      chip: 'border-[#cfe0ff] bg-[#eef4ff] text-[#2563eb] dark:border-white/10 dark:bg-[#101d3d] dark:text-[#7cb3ff]',
      card: 'bg-[#eef4ff] text-[#2563eb] dark:bg-[#101d3d] dark:text-[#7cb3ff]',
      text: 'text-[#2563eb] dark:text-[#7cb3ff]',
    },
    inventory: {
      chip: 'border-[#ffd5b5] bg-[#fff5ed] text-[#ea580c] dark:border-white/10 dark:bg-[#24170f] dark:text-[#fdba74]',
      card: 'bg-[#fff5ed] text-[#ea580c] dark:bg-[#24170f] dark:text-[#fdba74]',
      text: 'text-[#ea580c] dark:text-[#fdba74]',
    },
    crm: {
      chip: 'border-[#f9c9de] bg-[#fef1f7] text-[#db2777] dark:border-white/10 dark:bg-[#2a1522] dark:text-[#f9a8d4]',
      card: 'bg-[#fef1f7] text-[#db2777] dark:bg-[#2a1522] dark:text-[#f9a8d4]',
      text: 'text-[#db2777] dark:text-[#f9a8d4]',
    },
    sales: {
      chip: 'border-[#dfc6ff] bg-[#f8f1ff] text-[#9333ea] dark:border-white/10 dark:bg-[#21152d] dark:text-[#d8b4fe]',
      card: 'bg-[#f8f1ff] text-[#9333ea] dark:bg-[#21152d] dark:text-[#d8b4fe]',
      text: 'text-[#9333ea] dark:text-[#d8b4fe]',
    },
  };

  const clearFieldsButtonClass =
    'h-9 w-full sm:w-auto !border-[#d8cb77] !bg-[#efe39a] !text-[#3f3612] hover:!bg-[#e7da8d] hover:!text-[#3f3612]';

  // ---------------------------------------------------------------------------
  // Journal Entries API (R1A081 - R1A085)
  // ---------------------------------------------------------------------------

  const API_URL = getApiUrl();
  const ACCESS_TOKEN_KEY = 'raiports-access-token';

  type JournalEntryRow = {
    journalNo: string;
    j_code: string;
    j_num: string;
    entryDate: string;
    accountCode: string | null;
    accountName: string | null;
    description: string | null;
    remarks: string | null;
    debit: number;
    credit: number;
    posted: boolean;
  };

  type JournalFilters = {
    journalFrom: string;
    journalTo: string;
    dateFrom: string;
    dateTo: string;
    showPosted: boolean;
    showUnposted: boolean;
  };

  const DEFAULT_JOURNAL_FILTERS: JournalFilters = {
    journalFrom: '',
    journalTo: '',
    dateFrom: '',
    dateTo: '',
    showPosted: true,
    showUnposted: true,
  };

  const JOURNAL_REPORT_CODES = ['R1A081', 'R1A082', 'R1A083', 'R1A084', 'R1A085'];

  function isJournalReportCode(reportCode?: string) {
    return !!reportCode && JOURNAL_REPORT_CODES.includes(reportCode);
  }

  async function fetchJournalEntries(filters: JournalFilters): Promise<JournalEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;

    const params = new URLSearchParams();
    if (filters.journalFrom) params.set('journal_from', filters.journalFrom);
    if (filters.journalTo) params.set('journal_to', filters.journalTo);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    params.set('posted', String(filters.showPosted));
    params.set('unposted', String(filters.showUnposted));

    const res = await fetch(`${API_URL}/approval/journal-entries/?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load journal entries.');
    }

    return result.journal_entries || [];
  }

  // --- R1A01 REAL DATA: Account Activity By ID -----------------------------
  const ACCOUNT_ACTIVITY_REPORT_CODE = 'R1A01';

  function isAccountActivityReportCode(reportCode?: string) {
    return reportCode === ACCOUNT_ACTIVITY_REPORT_CODE;
  }

  // --- R1A02 REAL DATA: List of Unposted Entries ----------------------------
  const LIST_UNPOSTED_REPORT_CODE = 'R1A02';

  function isListUnpostedReportCode(reportCode?: string) {
    return reportCode === LIST_UNPOSTED_REPORT_CODE;
  }

  // --- R1A04 REAL DATA: Unposted Entries ------------------------------------
  // Same filter shape + output as R1A02. Reuses rpt_a102() on the backend
  // since no rpt_a104() function exists in the database. All dropdowns
  // (Branch, Journal, Period From/To) reuse the same endpoints as R1A02.
  const UNPOSTED_ENTRIES_A104_REPORT_CODE = 'R1A04';

  function isUnpostedEntriesA104ReportCode(reportCode?: string) {
    return reportCode === UNPOSTED_ENTRIES_A104_REPORT_CODE;
  }

  // --- R3A02 REAL DATA: View GL Activity by Account ID (A301 in desktop) -----
  // Branch + Account From/To (full m04) + Journal (single, m05) + Entry Dates.
  // Reuses CheckByCheckNumberFilterCard with full m04 accounts + m05 journals.
  const GL_ACTIVITY_BY_ACCOUNT_ID_REPORT_CODE = 'R3A02';

  function isGLActivityByAccountIDReportCode(reportCode?: string) {
    return reportCode === GL_ACTIVITY_BY_ACCOUNT_ID_REPORT_CODE;
  }
  // --- R3A03 REAL DATA: View GL by Journal ID (A302 in desktop) -------------
  // Branch + Journal From/To (real m05 dropdowns) + Entry Dates. NO Account
  // ID filter — confirmed via desktop screenshot. Reuses rpt_a101() with
  // p_at_code=NULL, same shape as R1A05's Account Movement Summary.
  const GL_BY_JOURNAL_ID_REPORT_CODE = 'R3A03';

  function isGLByJournalIDReportCode(reportCode?: string) {
    return reportCode === GL_BY_JOURNAL_ID_REPORT_CODE;
  }

  // --- R3A04 REAL DATA: GL Summary by Account ID (A303 in desktop) -----------
  // Branch + Account From/To (full m04) + single Journal (m05) + Entry Dates.
  // Output is SUMMARY (one row per account: total_debit, total_credit,
  // net_balance) — NOT transaction detail rows like R3A02. No stored function
  // exists; uses raw SQL GROUP BY at_code confirmed via pgAdmin (5 rows).
  const GL_SUMMARY_BY_ACCOUNT_ID_REPORT_CODE = 'R3A04';

  function isGLSummaryByAccountIDReportCode(reportCode?: string) {
    return reportCode === GL_SUMMARY_BY_ACCOUNT_ID_REPORT_CODE;
  }

  // --- SUBLEDGER REPORTS (R4A02, R4A03, R4A05, R4A06) ----------------------
  // R4A01 (Customer Ledger) and R4A04 (Suppliers Ledger) skipped — desktop crashes.
  const BALANCES_FROM_CUSTOMER_REPORT_CODE = 'R4A02';
  const CUSTOMERS_AGING_REPORT_CODE = 'R4A03';
  const BALANCES_TO_SUPPLIER_REPORT_CODE = 'R4A05';
  const SUPPLIERS_AGING_REPORT_CODE = 'R4A06';

  function isBalancesFromCustomerReportCode(c?: string) { return c === BALANCES_FROM_CUSTOMER_REPORT_CODE; }
  function isCustomersAgingReportCode(c?: string) { return c === CUSTOMERS_AGING_REPORT_CODE; }
  function isBalancesToSupplierReportCode(c?: string) { return c === BALANCES_TO_SUPPLIER_REPORT_CODE; }
  function isSuppliersAgingReportCode(c?: string) { return c === SUPPLIERS_AGING_REPORT_CODE; }

  function isSubledgerReportCode(c?: string) {
    return isBalancesFromCustomerReportCode(c) || isCustomersAgingReportCode(c) ||
      isBalancesToSupplierReportCode(c) || isSuppliersAgingReportCode(c);
  }

  // --- FINANCIAL STATEMENTS REPORTS (R5A01–R5A11) ---------------------------
  const TRIAL_BALANCE_CODE = 'R5A01';
  const ADJUSTED_BALANCE_SHEET_CODE = 'R5A02';
  const BALANCE_SHEET_LIST_CODE = 'R5A03';
  const BALANCE_SUMMARY_SHEET_CODE = 'R5A04';
  const COMPARATIVE_BALANCE_SHEET_CODE = 'R5A05';
  const COMPARATIVE_MONTHLY_BALANCE_SHEET_CODE = 'R5A06';
  const INCOME_STATEMENT_LIST_CODE = 'R5A07';
  const INCOME_STATEMENT_CODE = 'R5A08';
  const COMPARATIVE_INCOME_STATEMENT_CODE = 'R5A09';
  const COMPARATIVE_MONTHLY_INCOME_STATEMENT_CODE = 'R5A10';
  const COMPARATIVE_MONTHLY_INCOME_STATEMENT_CC_CODE = 'R5A11';

  function isFinancialPeriodReport(c?: string) {
    return c === TRIAL_BALANCE_CODE || c === ADJUSTED_BALANCE_SHEET_CODE ||
      c === BALANCE_SHEET_LIST_CODE || c === BALANCE_SUMMARY_SHEET_CODE ||
      c === COMPARATIVE_BALANCE_SHEET_CODE || c === INCOME_STATEMENT_LIST_CODE ||
      c === INCOME_STATEMENT_CODE || c === COMPARATIVE_INCOME_STATEMENT_CODE;
  }
  function isFinancialYearReport(c?: string) {
    return c === COMPARATIVE_MONTHLY_BALANCE_SHEET_CODE ||
      c === COMPARATIVE_MONTHLY_INCOME_STATEMENT_CODE ||
      c === COMPARATIVE_MONTHLY_INCOME_STATEMENT_CC_CODE;
  }
  function isFinancialStatementReportCode(c?: string) {
    return isFinancialPeriodReport(c) || isFinancialYearReport(c);
  }

  // --- R3A01 REAL DATA: General Journal (A300 in desktop) --------------------
  // All journal entries for a selected period. Reuses MismatchPeriodFilterCard.
  // Same output shape as R1A01.
  const GENERAL_JOURNAL_REPORT_CODE = 'R3A01';

  function isGeneralJournalReportCode(reportCode?: string) {
    return reportCode === GENERAL_JOURNAL_REPORT_CODE;
  }

  // --- R2A03 REAL DATA: Check By Check Number (A203 in desktop) ---------------
  // Same as R2A01 + Journal Book filter (from rssys.m05.j_desc).
  // Reuses fetchJournals() already available. New filter card needed.
  const CHECK_BY_CHECK_NUMBER_REPORT_CODE = 'R2A03';

  function isCheckByCheckNumberReportCode(reportCode?: string) {
    return reportCode === CHECK_BY_CHECK_NUMBER_REPORT_CODE;
  }

  // --- R2A02 REAL DATA: Check By Check Date (A202 in desktop) ----------------
  // Same as R2A01 but filters on ck_date instead of t_date.
  // Reuses CheckByEntryDateFilterCard with "Check Date" labels.
  const CHECK_BY_CHECK_DATE_REPORT_CODE = 'R2A02';

  function isCheckByCheckDateReportCode(reportCode?: string) {
    return reportCode === CHECK_BY_CHECK_DATE_REPORT_CODE;
  }

  // --- R2A01 REAL DATA: Check By Entry Date (A201 in desktop) ----------------
  // Issued checks filtered by account range + date. New output columns:
  // Date, Journal No., Check No., Check Date, Payee, Account Code,
  // Account Name, Debit, Credit.
  const CHECK_BY_ENTRY_DATE_REPORT_CODE = 'R2A01';

  function isCheckByEntryDateReportCode(reportCode?: string) {
    return reportCode === CHECK_BY_ENTRY_DATE_REPORT_CODE;
  }

  type CheckEntryRow = {
    date: string;
    j_num: string;
    j_code: string;
    ck_num: string;
    ck_date: string;
    payee: string;
    at_code: string;
    at_desc: string;
    debit: number;
    credit: number;
  };

  // --- SALES REAL DATA: OTC Sales Report row shape (R1000/R1S00/R2000/R2S00).
  type SalesRow = {
    salesDate: string;
    invoiceNo: string;
    customerName: string;
    cashier: string;
    paymentType: string;
    grossSales: number;
    discount: number;
    netSales: number;
  };

  // --- INVENTORY REAL DATA: generic row shape shared across Inventory
  // Reports. For Purchase Request Reports (R1I01/02/03), these map to
  // rssys.prhdr/prlne: date <- pr_date, reference <- reference,
  // description <- item_desc, requestedBy <- request_by, quantity <-
  // quantity, docNo <- pr_code. For Purchase Order Reports (R2I01/03/04),
  // they map to rssys.purhdr/purlne instead: date <- t_date, requestedBy
  // <- supl_name (POs don't have a request_by worth surfacing here since
  // it's frequently blank — supplier is more useful), quantity <-
  // rels_qty, docNo <- purc_ord. Neither table has a real "remarks"
  // column — docNo (PR code or PO number) is shown in that slot instead,
  // since it's real, confirmed data rather than an empty guessed field.
  type InventoryRow = {
    date: string;
    reference: string;
    description: string;
    requestedBy: string;
    quantity: number;
    docNo: string;
  };

  // --- R1A085 REAL DATA: Subsidiary Transactions Different Account Link (7786) -
  // Same filter layout as R1A083: Branch + single Accounting Period, no dates.
  // Reuses MismatchPeriodFilterCard.
  const SUBSIDIARY_DIFF_ACCOUNT_LINK_REPORT_CODE = 'R1A085';

  function isSubsidiaryDiffAccountLinkReportCode(reportCode?: string) {
    return reportCode === SUBSIDIARY_DIFF_ACCOUNT_LINK_REPORT_CODE;
  }

  // --- R1A084 REAL DATA: Without Account Link Report (7785 in desktop) -------
  // Finds tr01/tr02 entries where at_code is NULL or not in m04.
  // Filters: Branch + Accounting Period + Entry Dates.
  // Same output columns as R1A081/R1A082/R1A083.
  const WITHOUT_ACCOUNT_LINK_REPORT_CODE = 'R1A084';

  function isWithoutAccountLinkReportCode(reportCode?: string) {
    return reportCode === WITHOUT_ACCOUNT_LINK_REPORT_CODE;
  }

  // --- R1A083 REAL DATA: Mismatch Accounting Periods to Journal Dates (7784) -
  // Finds tr01 entries where fy/mo doesn't match t_date calendar month/year.
  // Filters: Branch + Accounting Period (single picker from rssys.x03).
  // Same output columns as R1A081/R1A082.
  const MISMATCH_ACCOUNTING_PERIOD_REPORT_CODE = 'R1A083';

  function isMismatchAccountingPeriodReportCode(reportCode?: string) {
    return reportCode === MISMATCH_ACCOUNTING_PERIOD_REPORT_CODE;
  }

  // --- R1A082 REAL DATA: Subsidiary Accounts without Subsidiary (7783) ------
  // Raw SQL on tr01/tr02 where sl_code/sl_name is empty.
  // Same filter layout as R1A081: Branch + Account Title + Entry Dates.
  // Same output columns as R1A081.
  const SUBSIDIARY_WITHOUT_SUBSIDIARY_REPORT_CODE = 'R1A082';

  function isSubsidiaryWithoutSubsidiaryReportCode(reportCode?: string) {
    return reportCode === SUBSIDIARY_WITHOUT_SUBSIDIARY_REPORT_CODE;
  }

  // --- R1A081 REAL DATA: Unbalance Journal List (7782 in desktop) -----------
  // Raw SQL on tr01/tr02 — journals where debit != credit.
  // Filters: Branch + Account Title (from m04) + Entry Dates.
  // Output: Date, Journal No., Account Code, Account Name, Description,
  //         Remarks, Debit, Credit (no Running Balance).
  const UNBALANCE_JOURNAL_LIST_REPORT_CODE = 'R1A081';

  function isUnbalanceJournalListReportCode(reportCode?: string) {
    return reportCode === UNBALANCE_JOURNAL_LIST_REPORT_CODE;
  }

  type UnbalanceJournalRow = {
    date: string;
    j_num: string;
    j_code: string;
    at_code: string;
    at_desc: string;
    description: string;
    remarks: string;
    debit: number;
    credit: number;
  };

  // --- R1A07 REAL DATA: Summary of Statement of Accounts (A106 in desktop) --
  // Reuses rpt_a101() with all filters NULL except dates.
  // Desktop A106 filters: Entry Dates From/To ONLY — no Branch, no Journal,
  // no Account ID, no Unposted/Posted checkboxes.
  const SUMMARY_STATEMENT_ACCOUNTS_REPORT_CODE = 'R1A07';

  function isSummaryStatementAccountsReportCode(reportCode?: string) {
    return reportCode === SUMMARY_STATEMENT_ACCOUNTS_REPORT_CODE;
  }

  // --- R1A061 REAL DATA: Summary of Output Tax (A105SOTL in desktop) --------
  // Reuses rpt_a101() filtered to at_code='2102 4' (OUTPUT VAT PAYABLE).
  // Desktop A105SOTL filters: Branch + Entry Dates only.
  // No Journal From/To, no Account ID, no Unposted/Posted checkboxes.
  const SUMMARY_OUTPUT_TAX_REPORT_CODE = 'R1A061';

  function isSummaryOutputTaxReportCode(reportCode?: string) {
    return reportCode === SUMMARY_OUTPUT_TAX_REPORT_CODE;
  }

  // --- R1A06 REAL DATA: Summary of Input Tax (A105 in desktop) -------------
  // Reuses rpt_a101() filtered to at_code='1105 3' (VAT INPUT).
  // Desktop A105 filters: Branch + Entry Dates only.
  // No Journal From/To, no Account ID, no Unposted/Posted checkboxes.
  const SUMMARY_INPUT_TAX_REPORT_CODE = 'R1A06';

  function isSummaryInputTaxReportCode(reportCode?: string) {
    return reportCode === SUMMARY_INPUT_TAX_REPORT_CODE;
  }

  // --- R1A05 REAL DATA: Account Movement Summary (A107 in desktop) ---------
  // Reuses rpt_a101() with p_at_code=NULL (all accounts). No Account ID
  // filter — desktop A107 only has Branch, Journal From/To, Entry Dates.
  const ACCOUNT_MOVEMENT_SUMMARY_REPORT_CODE = 'R1A05';

  function isAccountMovementSummaryReportCode(reportCode?: string) {
    return reportCode === ACCOUNT_MOVEMENT_SUMMARY_REPORT_CODE;
  }

  // --- R1A03 REAL DATA: Cash Position (CIB) ---------------------------------
  const CASH_POSITION_REPORT_CODE = 'R1A03';

  function isCashPositionReportCode(reportCode?: string) {
    return reportCode === CASH_POSITION_REPORT_CODE;
  }

  // Any report code with a real backend fetch wired up (used to enable the
  // Preview/Clear buttons, which are otherwise inert placeholders).
  function isWiredReportCode(reportCode?: string) {
    return (
      isJournalReportCode(reportCode) ||
      isAccountActivityReportCode(reportCode) ||
      isListUnpostedReportCode(reportCode) ||
      isCashPositionReportCode(reportCode) ||
      isUnpostedEntriesA104ReportCode(reportCode) ||
      isAccountMovementSummaryReportCode(reportCode) ||
      isSummaryInputTaxReportCode(reportCode) ||
      isSummaryOutputTaxReportCode(reportCode) ||
      isSummaryStatementAccountsReportCode(reportCode) ||
      isUnbalanceJournalListReportCode(reportCode) ||
      isSubsidiaryWithoutSubsidiaryReportCode(reportCode) ||
      isMismatchAccountingPeriodReportCode(reportCode) ||
      isWithoutAccountLinkReportCode(reportCode) ||
      isSubsidiaryDiffAccountLinkReportCode(reportCode) ||
      isCheckByEntryDateReportCode(reportCode) ||
      isCheckByCheckDateReportCode(reportCode) ||
      isCheckByCheckNumberReportCode(reportCode) ||
      isGeneralJournalReportCode(reportCode) ||
      isGLActivityByAccountIDReportCode(reportCode) ||
      isGLByJournalIDReportCode(reportCode) ||
      isGLSummaryByAccountIDReportCode(reportCode) ||
      isSubledgerReportCode(reportCode) ||
      isFinancialStatementReportCode(reportCode)
    );
  }

  // Local-time YYYY-MM-DD formatter — avoids the UTC-shift bug where
  // toISOString() silently turns "today" into "yesterday" in PHT (UTC+8).
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  type AccountActivityRow = {
    date: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    running_balance: number;
  };

  // R3A04 — GL Summary by Account ID (A303). One row per account, totals only.
  type GLSummaryRow = {
    at_code: string;
    at_desc: string;
    total_debit: number;
    total_credit: number;
    net_balance: number;
  };

  // R5A01–R5A11 — Financial Statement reports. Trial balance shape.
  type FinancialStatementRow = {
    at_code: string;
    at_desc: string;
    bal_begin: number;
    debit: number;
    credit: number;
    bal_end: number;
    section?: string;
    cc_code?: string;
  };

  // Intentionally does NOT send branch/account_id — same as fetchJournalEntries
  // above never does either. The backend treats a missing filter as "no
  // restriction, show everything," which avoids guessing at the unconfirmed
  // "HEAD OFFICE" -> real branch code mapping.
  async function fetchAccountActivity(
    filters: JournalFilters,
    branch?: string,
    accountId?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    if (filters.journalFrom) params.set('journal_from', filters.journalFrom);
    if (filters.journalTo) params.set('journal_to', filters.journalTo);
    params.set('entry_date_from', filters.dateFrom);
    params.set('entry_date_to', filters.dateTo);
    params.set('unposted', String(filters.showUnposted));
    params.set('posted', String(filters.showPosted));
    // --- R1A01 REAL DATA (branch fix): now actually sends the selected
    // branch, matching R1A02's real dropdown instead of always querying
    // every branch.
    if (branch) params.set('branch', branch);
    // --- R1A01 REAL DATA (Account ID fix): backend already accepted this
    // param from the start — just never sent from the frontend until now.
    if (accountId) params.set('account_id', accountId);

    const res = await fetch(
      `${API_URL}/approval/reports/account-activity-by-id/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load account activity.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // FLAG: same unconfirmed "HEAD OFFICE -> real branch code" mapping gap as
  // A101. Hardcoded to 'MAN' since that's the only branch we've confirmed
  // has real tr01 data (and real m05 journal codes). Needs a real dropdown
  // or lookup once branch labels are resolved properly.
  // --- R1A02 REAL DATA: Branch dropdown now fetched from rssys.branch via
  // the backend, instead of a hardcoded list — catches real discrepancies
  // like General Santos actually being coded "GES", not "GEN" as originally
  // (wrongly) assumed from the label alone.
  async function fetchBranches(): Promise<{ value: string; label: string }[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const res = await fetch(`${API_URL}/approval/reports/branches/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load branches.');
    }

    return Array.isArray(result.branches) ? result.branches : [];
  }

  // --- R1A01 REAL DATA (Account ID fix): Chart of Accounts, company-wide
  // (confirmed m04.branch is empty on every row — not branch-specific like
  // m05's journals). Also reused as-is by R1A03's Account ID dropdown.
  async function fetchChartOfAccounts(): Promise<{ value: string; label: string }[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const res = await fetch(`${API_URL}/approval/reports/chart-of-accounts/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load chart of accounts.');
    }

    return Array.isArray(result.accounts) ? result.accounts : [];
  }

  // --- R1A03 REAL DATA: CIB-only accounts — m04 filtered to cib_acct='Y'.
  // Confirmed 1 row in live_seanagro ('62020', 'MATERIALS & SUPPLIES').
  // NOT the same as fetchChartOfAccounts() which returns all 82 accounts
  // and is used by R1A01.
  async function fetchCIBAccounts(): Promise<{ value: string; label: string }[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const res = await fetch(`${API_URL}/approval/reports/cib-accounts/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load CIB accounts.');
    }

    return Array.isArray(result.accounts) ? result.accounts : [];
  }

  type PeriodOption = {
    value: string; // "fy-mo", e.g. "2026-1" — matches rpt_a102's expected format
    label: string; // e.g. "January 2026"
    fy: number;
    mo: number;
  };

  type JournalOption = {
    value: string; // e.g. "MAN-CDB"
    label: string; // e.g. "CHECK DISBURSEMENT BOOK"
  };

  type UnpostedEntryRow = {
    j_num: string;
    j_code: string;
    mo: string;
    t_date: string;
    payee: string;
    t_desc: string;
    ck_num: string;
    ck_date: string;
    j_memo: string | null;
    at_code: string;
    at_desc: string | null;
    sl_code: string;
    sl_name: string;
    debit: number;
    credit: number;
    invoice: string;
    cc_code: string;
  };

  // --- R1A02 REAL DATA (also reused by R1A03 for its Financial Year
  // dropdown, deduped to distinct years).
  async function fetchAccountingPeriods(): Promise<PeriodOption[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const res = await fetch(`${API_URL}/approval/reports/accounting-periods/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load accounting periods.');
    }

    return Array.isArray(result.periods) ? result.periods : [];
  }

  async function fetchJournals(branch?: string): Promise<JournalOption[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    if (branch) params.set('branch', branch);

    const res = await fetch(`${API_URL}/approval/reports/journals/?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load journals.');
    }

    return Array.isArray(result.journals) ? result.journals : [];
  }

  async function fetchListOfUnpostedEntries(filters: {
    periodFrom: string;
    periodTo: string;
    jCode?: string;
    branch?: string;
  }): Promise<UnpostedEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period_from', filters.periodFrom);
    params.set('period_to', filters.periodTo);
    if (filters.jCode) params.set('j_code', filters.jCode);
    if (filters.branch) params.set('branch', filters.branch);

    const res = await fetch(
      `${API_URL}/approval/reports/list-of-unposted-entries/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load list of unposted entries.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A04 REAL DATA: Unposted Entries — reuses the same
  // fetchListOfUnpostedEntries() function as R1A02, just pointing at a
  // different backend endpoint that calls rpt_a102() under the hood.
  async function fetchUnpostedEntriesA104(filters: {
    periodFrom: string;
    periodTo: string;
    jCode?: string;
    branch?: string;
  }): Promise<UnpostedEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period_from', filters.periodFrom);
    params.set('period_to', filters.periodTo);
    if (filters.jCode) params.set('j_code', filters.jCode);
    if (filters.branch) params.set('branch', filters.branch);

    const res = await fetch(
      `${API_URL}/approval/reports/unposted-entries-a104/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load unposted entries (A104).');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R3A02 REAL DATA: GL Activity by Account ID fetch.
  async function fetchGLActivityByAccountID(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCodeFrom?: string,
    jCode?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCodeFrom && atCodeFrom !== 'all') params.set('at_code_from', atCodeFrom);
    if (jCode && jCode !== 'all') params.set('j_code', jCode);

    const res = await fetch(
      `${API_URL}/approval/reports/gl-activity-by-account-id/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load GL activity by account ID.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R3A01 REAL DATA: General Journal fetch.
  async function fetchGeneralJournal(
    period: string,
    branch?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period', period);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/general-journal/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load general journal.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R2A03 REAL DATA: Check By Check Number fetch.
  async function fetchCheckByCheckNumber(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCodeFrom?: string,
    atCodeTo?: string,
    jDesc?: string,
  ): Promise<CheckEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCodeFrom && atCodeFrom !== 'all') params.set('at_code_from', atCodeFrom);
    if (atCodeTo && atCodeTo !== 'all') params.set('at_code_to', atCodeTo);
    if (jDesc && jDesc !== 'all') params.set('j_desc', jDesc);

    const res = await fetch(
      `${API_URL}/approval/reports/check-by-check-number/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load check by check number report.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R2A02 REAL DATA: Check By Check Date fetch.
  async function fetchCheckByCheckDate(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCodeFrom?: string,
    atCodeTo?: string,
  ): Promise<CheckEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('check_date_from', dateFrom);
    params.set('check_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCodeFrom && atCodeFrom !== 'all') params.set('at_code_from', atCodeFrom);
    if (atCodeTo && atCodeTo !== 'all') params.set('at_code_to', atCodeTo);

    const res = await fetch(
      `${API_URL}/approval/reports/check-by-check-date/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load check by check date report.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R2A01 REAL DATA: Check By Entry Date fetch.
  async function fetchCheckByEntryDate(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCodeFrom?: string,
    atCodeTo?: string,
  ): Promise<CheckEntryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCodeFrom && atCodeFrom !== 'all') params.set('at_code_from', atCodeFrom);
    if (atCodeTo && atCodeTo !== 'all') params.set('at_code_to', atCodeTo);

    const res = await fetch(
      `${API_URL}/approval/reports/check-by-entry-date/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load check by entry date report.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- SALES REAL DATA: OTC Sales Report fetch (R1000/R1S00/R2000/R2S00).
  async function fetchOTCSales(
    branch: string,
    outlet: string,
    dateFrom: string,
    dateTo: string,
    viewAs: string,
    staffFrom?: string,
    staffTo?: string,
  ): Promise<SalesRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('branch', branch);
    if (outlet) params.set('outlet', outlet);
    params.set('date_from', dateFrom);
    params.set('date_to', dateTo);
    params.set('view_as', viewAs);
    // --- R4000 ONLY: optional Staff From/To range.
    if (staffFrom) params.set('staff_from', staffFrom);
    if (staffTo) params.set('staff_to', staffTo);

    const res = await fetch(
      `${API_URL}/approval/reports/sales/otc/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load OTC sales.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- INVENTORY REAL DATA: fetch shared by all Inventory Reports.
  // Only R1I01/R1I02/R1I03 (Purchase Request Reports) map to real
  // endpoints so far. Every other Inventory code throws a clear
  // "not built yet" error client-side instead of silently hitting a
  // route that doesn't exist — extend this map as each report group's
  // backend gets built out.
  //
  // NOTE: R1I01/02/03 are three DISTINCT endpoints, not one shared route
  // — R1I02 needs a PR Number From/To range and R1I03 needs a single
  // Item filter, neither of which a single shared endpoint can express
  // cleanly. Confirmed via desktop screenshots (I012/I013).
  const INVENTORY_ENDPOINT_BY_CODE: Record<string, string> = {
    R1I01: '/approval/reports/purchase-requests/by-branch/',
    R1I02: '/approval/reports/purchase-requests/by-number/',
    R1I03: '/approval/reports/purchase-requests/by-items/',
    R2I01: '/approval/reports/purchase-orders/by-date/',
    R2I03: '/approval/reports/purchase-orders/by-supplier/',
    R2I04: '/approval/reports/purchase-orders/by-items/',
    R3I01: '/approval/reports/receiving/by-date/',
    R3I02: '/approval/reports/receiving/by-number/',
    // R3I03 "Receiving P.O. By Items" — Items filter only, confirmed via
    // the frontend breadcrumb ("Receiving P.O. By Items"). The desktop
    // "Other Options" screen (By Branch + By Date + 3x User ID +
    // checkbox1/2/3) is a SEPARATE, still-unidentified report — its
    // window title was never visible in any screenshot, so it does NOT
    // belong on this report's filter card. Corrected after an earlier
    // pass incorrectly merged the two. Revisit once that screen's real
    // title/report code is confirmed via a screenshot showing its
    // title bar.
    R3I03: '/approval/reports/receiving/by-items/',
    // R4I01–R4I04 "Direct Purchase Reports" (I041–I044). rssys.pinvhd is
    // currently EMPTY in live_easyeats (COUNT(*)=0, confirmed via
    // pgAdmin) — cancel/finalized filtering on the backend is a
    // best-guess default (finalized='Y', following purhdr's pattern
    // since pinvhd has the same finalized/closed column set), NOT
    // verified against real data the way every other report family's
    // filters were. Revisit once real Direct Purchase transactions
    // exist in this tenant.
    R4I01: '/approval/reports/direct-purchases/by-date/',
    R4I02: '/approval/reports/direct-purchases/by-number/',
    R4I03: '/approval/reports/direct-purchases/by-supplier/',
    R4I04: '/approval/reports/direct-purchases/by-items/',
    // R5I01–R5I04 "Stock Issuance Reports" (I051–I054). rssys.stkcrd is
    // a flat stock-card ledger (no hdr/lne pair) with ZERO trn_type='I'
    // rows across BOTH tenants (confirmed via pgAdmin — only P/T/A
    // exist) — the 'I' filter and reference-prefix convention are
    // INFERRED, not verified against real data. Revisit once real
    // Stock Issuance transactions exist. Cost Center (I054) is a real
    // column (cnt_code) on stkcrd itself, not a Branch reuse.
    R5I01: '/approval/reports/stock-issuance/by-date/',
    R5I02: '/approval/reports/stock-issuance/by-number/',
    R5I03: '/approval/reports/stock-issuance/by-items/',
    R5I04: '/approval/reports/stock-issuance/by-cost-center/',
    // R6I01–R6I03 "Stock Transfer Reports" (I061–I063). rssys.stkcrd,
    // trn_type='T' — CONFIRMED against one real row in live_easyeats
    // (zero in live_seanagro). No Cost Center filter exists for this
    // family (cnt_code not populated for Transfer rows, and desktop
    // only shows 3 reports here, not 4).
    R6I01: '/approval/reports/stock-transfer/by-date/',
    R6I02: '/approval/reports/stock-transfer/by-number/',
    R6I03: '/approval/reports/stock-transfer/by-items/',
    // R7I01–R7I03 "Stock Adjustment Reports" (I071–I073). rssys.stkcrd,
    // trn_type='A' — CONFIRMED against 3 real rows in live_easyeats.
    // Quantity is qty_in here (Adjustment adds stock). Adjustment
    // Number From/To (R7I02) is free text, same as Transfer Number
    // (R6I02) — desktop dropdown showed a static "BEGINNING BALANCE"
    // value matching no real row.
    R7I01: '/approval/reports/stock-adjustment/by-date/',
    R7I02: '/approval/reports/stock-adjustment/by-number/',
    R7I03: '/approval/reports/stock-adjustment/by-items/',
    // R9I00/R10I00/R11I00 "Other Inventory Reports" (desktop I01/I02/
    // I03). Computed from rssys.stkcrd (SUM(qty_in)-SUM(qty_out) per
    // item), NOT read from items.qty_onhand/cost_pric/reorder directly
    // — those are date-less static columns that are all zero/null in
    // this tenant despite real stkcrd movements existing. R8I00 "Item
    // Transaction Card" is NOT mapped here — it throws "Empty report
    // code." on the desktop app itself (broken on the source system),
    // so there is nothing to replicate.
    R9I00: '/approval/reports/inventory-summary/by-date/',
    R10I00: '/approval/reports/inventory-valuation/',
    R11I00: '/approval/reports/reorder-level/',
  };

  async function fetchInventoryReport(
    reportCode: string,
    branch: string,
    dateFrom: string,
    dateTo: string,
    prFrom?: string,
    prTo?: string,
    itemCode?: string,
    supplier?: string,
    rrFrom?: string,
    rrTo?: string,
    cntFrom?: string,
    cntTo?: string,
    warehouse?: string,
    itemGrp?: string,
    asOf?: string,
    negativeOnly?: boolean,
    zeroCostOnly?: boolean,
  ): Promise<InventoryRow[]> {
    const endpoint = INVENTORY_ENDPOINT_BY_CODE[reportCode];
    if (!endpoint) {
      // R8I00 "Item Transaction Card" is a special case: it throws
      // "Empty report code." on the desktop app itself — broken on
      // the source system, not just unbuilt here.
      if (reportCode === 'R8I00') {
        throw new Error('Item Transaction Card is unavailable — this report is broken on the source desktop system itself ("Empty report code." error), so there is no working reference to build against.');
      }
      throw new Error(`${reportCode} isn't wired to a backend yet — ask about building this report next.`);
    }

    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('branch', branch);
    params.set('date_from', dateFrom);
    params.set('date_to', dateTo);
    // --- R1I02 ONLY: PR Number From/To range.
    if (reportCode === 'R1I02') {
      if (prFrom) params.set('pr_from', prFrom);
      if (prTo) params.set('pr_to', prTo);
    }
    // --- R4I02 ONLY: Direct Purchase Number From/To range. Reuses the
    // same prFrom/prTo plumbing as R1I02 (identical "number range"
    // shape) rather than adding a parallel set of state/params.
    if (reportCode === 'R4I02') {
      if (prFrom) params.set('inv_from', prFrom);
      if (prTo) params.set('inv_to', prTo);
    }
    // --- R5I02 ONLY: Issuance Number From/To range. Reuses the same
    // prFrom/prTo plumbing as R1I02/R4I02 (identical "number range"
    // shape) rather than adding a parallel set of state/params.
    // stkcrd has no separate numeric doc column — this range is on
    // reference itself. UNVERIFIED against real data (no 'I' rows
    // exist yet) — see reports.py module docstring.
    if (reportCode === 'R5I02') {
      if (prFrom) params.set('iss_from', prFrom);
      if (prTo) params.set('iss_to', prTo);
    }
    // --- R6I02 ONLY: Transfer Number From/To range. Reuses the same
    // prFrom/prTo plumbing as R1I02/R4I02/R5I02.
    if (reportCode === 'R6I02') {
      if (prFrom) params.set('trf_from', prFrom);
      if (prTo) params.set('trf_to', prTo);
    }
    // --- R7I02 ONLY: Adjustment Number From/To range. Reuses the same
    // prFrom/prTo plumbing as R1I02/R4I02/R5I02/R6I02.
    if (reportCode === 'R7I02') {
      if (prFrom) params.set('adj_from', prFrom);
      if (prTo) params.set('adj_to', prTo);
    }
    // --- R1I03 / R2I04 / R3I03 / R4I04 / R5I03 / R6I03 / R7I03 ONLY:
    // single Item filter (item_code, never item_desc — descriptions
    // are inconsistently formatted, confirmed via pgAdmin). All seven
    // share the same rssys.items source.
    if ((reportCode === 'R1I03' || reportCode === 'R2I04' || reportCode === 'R3I03' || reportCode === 'R4I04' || reportCode === 'R5I03' || reportCode === 'R6I03' || reportCode === 'R7I03') && itemCode) {
      params.set('item_code', itemCode);
    }
    // --- R2I03 / R4I03 ONLY: single Supplier filter (supl_code, e.g. "000-395").
    if ((reportCode === 'R2I03' || reportCode === 'R4I03') && supplier) {
      params.set('supplier', supplier);
    }
    // --- R3I02 ONLY: RR Number From/To range.
    if (reportCode === 'R3I02') {
      if (rrFrom) params.set('rr_from', rrFrom);
      if (rrTo) params.set('rr_to', rrTo);
    }
    // --- R5I04 ONLY: Cost Center From/To range (stkcrd.cnt_code, a
    // real column — see reports.py module docstring re: the branch
    // join used for its dropdown labels, UNVERIFIED beyond one sample).
    if (reportCode === 'R5I04') {
      if (cntFrom) params.set('cnt_from', cntFrom);
      if (cntTo) params.set('cnt_to', cntTo);
    }
    // --- R9I00 / R10I00 ONLY: optional Warehouse filter (rssys.whouse,
    // CONFIRMED — matches the desktop dropdown exactly).
    if ((reportCode === 'R9I00' || reportCode === 'R10I00') && warehouse) {
      params.set('warehouse', warehouse);
    }
    // --- R9I00 / R10I00 / R11I00 ONLY: optional Item Group filter
    // (rssys.itmgrp, CONFIRMED — matches the desktop dropdown exactly.
    // NOTE: this also identifies the real source table for the
    // long-standing R3O00 Item Group placeholder in SalesFilterCard —
    // NOT wired there yet, that's a separate follow-up task).
    if ((reportCode === 'R9I00' || reportCode === 'R10I00' || reportCode === 'R11I00') && itemGrp) {
      params.set('item_grp', itemGrp);
    }
    // --- R10I00 ONLY: single "As Of" date replaces the base
    // date_from/date_to pair (Valuation is a point-in-time snapshot,
    // not a period range — see reports.py module docstring for why
    // this is computed from stkcrd rather than items.qty_onhand).
    if (reportCode === 'R10I00' && asOf) {
      params.set('as_of', asOf);
    }
    // --- R9I00 ONLY: the two desktop checkboxes ("Display Negative
    // Count Only" / "Display Zero Cost Price Only"), applied as HAVING
    // filters on the backend's computed net quantity / cost_pric.
    if (reportCode === 'R9I00') {
      if (negativeOnly) params.set('negative_only', 'true');
      if (zeroCostOnly) params.set('zero_cost_only', 'true');
    }

    const res = await fetch(`${API_URL}${endpoint}?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load inventory report.');
    }

    const rawRows: any[] = Array.isArray(result.data) ? result.data : [];

    // Backend returns raw rssys column names. Purchase Request reports
    // use pr_date/pr_code/quantity/reference; Purchase Order reports use
    // t_date/purc_ord/rels_qty/reference; Receiving reports use
    // t_date/rec_num/recv_qty/_reference (leading underscore) and
    // recipient instead of request_by; Direct Purchase reports use
    // t_date/inv_num/inv_qty/reference and supl_name/recipient; Stock
    // Issuance reports use t_date/reference/quantity (stkcrd has no
    // separate doc-number column, so reference doubles as stk_reference
    // for docNo, and requestedBy is intentionally blank — no
    // requester/recipient column exists on stkcrd) — map all five onto
    // the same InventoryRow shape the preview builder and table already
    // expect.
    return rawRows.map((r) => ({
      date: r.pr_date ?? r.t_date ?? '',
      reference: r.reference ?? r._reference ?? '',
      description: r.item_desc ?? '',
      requestedBy: r.request_by ?? r.supl_name ?? r.recipient ?? '',
      quantity: Number(r.quantity ?? r.rels_qty ?? r.recv_qty ?? r.inv_qty ?? 0),
      docNo: r.pr_code ?? r.purc_ord ?? r.rec_num ?? r.inv_num ?? r.stk_reference ?? '',
    }));
  }

  // --- R1A085 REAL DATA: Subsidiary Transactions Different Account Link fetch.
  async function fetchSubsidiaryDiffAccountLink(
    period: string,
    branch?: string,
  ): Promise<UnbalanceJournalRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period', period);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/subsidiary-transactions-different-account-link/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load subsidiary transactions different account link.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A084 REAL DATA: Without Account Link Report fetch.
  async function fetchWithoutAccountLinkReport(
    period: string,
    dateFrom: string,
    dateTo: string,
    branch?: string,
  ): Promise<UnbalanceJournalRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period', period);
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/without-account-link-report/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load without account link report.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A083 REAL DATA: Mismatch Accounting Period to Journal Dates fetch.
  async function fetchMismatchAccountingPeriod(
    period: string,
    branch?: string,
  ): Promise<UnbalanceJournalRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('period', period);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/mismatch-accounting-period-to-journal-dates/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load mismatch accounting period report.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A082 REAL DATA: Subsidiary Accounts without Subsidiary fetch.
  async function fetchSubsidiaryWithoutSubsidiary(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCode?: string,
  ): Promise<UnbalanceJournalRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCode && atCode !== 'all') params.set('at_code', atCode);

    const res = await fetch(
      `${API_URL}/approval/reports/subsidiary-accounts-without-subsidiary/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load subsidiary accounts without subsidiary.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A081 REAL DATA: Unbalance Journal List fetch.
  async function fetchUnbalanceJournalList(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCode?: string,
  ): Promise<UnbalanceJournalRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCode && atCode !== 'all') params.set('at_code', atCode);

    const res = await fetch(
      `${API_URL}/approval/reports/unbalance-journal-list/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load unbalance journal list.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A07 REAL DATA: Summary of Statement of Accounts fetch.
  async function fetchSummaryStatementOfAccounts(
    dateFrom: string,
    dateTo: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);

    const res = await fetch(
      `${API_URL}/approval/reports/summary-of-statement-of-accounts/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load summary of statement of accounts.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A061 REAL DATA: Summary of Output Tax fetch.
  async function fetchSummaryOfOutputTax(
    dateFrom: string,
    dateTo: string,
    branch?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/summary-of-output-tax/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load summary of output tax.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A06 REAL DATA: Summary of Input Tax fetch.
  async function fetchSummaryOfInputTax(
    dateFrom: string,
    dateTo: string,
    branch?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/summary-of-input-tax/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load summary of input tax.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A05 REAL DATA: Account Movement Summary fetch.
  async function fetchAccountMovementSummary(
    filters: JournalFilters,
    branch?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    if (filters.journalFrom) params.set('journal_from', filters.journalFrom);
    if (filters.journalTo) params.set('journal_to', filters.journalTo);
    params.set('entry_date_from', filters.dateFrom);
    params.set('entry_date_to', filters.dateTo);
    params.set('unposted', String(filters.showUnposted));
    params.set('posted', String(filters.showPosted));
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/account-movement-summary/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load account movement summary.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // --- R1A03 REAL DATA: Cash Position (CIB) fetch. Identical response
  // shape to Account Activity (date/reference/description/debit/credit/
  // running_balance), so it reuses AccountActivityRow rather than defining
  // a new type. Unlike R1A01, account_id is REQUIRED — the backend 400s
  // without one.
  type CashPositionRow = AccountActivityRow;

  async function fetchCashPositionCIB(
    filters: JournalFilters,
    branch: string,
    accountId: string,
    fy: string,
    includePrevious: boolean,
  ): Promise<CashPositionRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('branch', branch);
    params.set('account_id', accountId);
    params.set('entry_date_from', filters.dateFrom);
    params.set('entry_date_to', filters.dateTo);
    params.set('unposted', String(filters.showUnposted));
    params.set('posted', String(filters.showPosted));
    params.set('include_previous', String(includePrevious));
    if (fy !== 'all') params.set('fy', fy);

    const res = await fetch(
      `${API_URL}/approval/reports/cash-position-cib/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load cash position.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  // current fiscal period ("fy-mo") — used as the default Period From/To so
  // the report auto-loads without typing, same "default to today" pattern
  // as A101's dates (may well be empty if this period has no data yet —
  // that's expected, not a bug, same as A101).
  function getCurrentPeriodValue() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  }

  type CompanyInfo = {
    comp_name: string;
    comp_addr: string;
    comp_tel: string;
  };

  async function fetchCompanyInfo(branch: string): Promise<CompanyInfo | null> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const res = await fetch(`${API_URL}/company/${encodeURIComponent(branch)}/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });

    const result = await res.json();
    if (!res.ok || !result.success) return null;

    return {
      comp_name: result.data?.comp_name || '',
      comp_addr: result.data?.comp_addr || '',
      comp_tel: result.data?.comp_tel || '',
    };
  }

  type TableColumn = {
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    minWidth?: string;
  };

  type TableRow = Record<string, string | number>;

  type ReportDefinition = {
    columns: TableColumn[];
    rows: TableRow[];
  };

  function itemCount(subCategory: (typeof reportsData)[number]['subCategories'][number]) {
    return subCategory.sections.reduce((sum, s) => sum + s.items.length, 0);
  }

  export default function ReportsShell() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isDark, setIsDark] = useState(false);

    const [groupKey, setGroupKey] = useState<string | null>(
      reportsData[0]?.key ?? null,
    );
    const [subKey, setSubKey] = useState<string | null>(null);
    const [subSearch, setSubSearch] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [reportCode, setReportCode] = useState<string | null>(null);

    const [journalFilters, setJournalFilters] = useState<JournalFilters>(
      DEFAULT_JOURNAL_FILTERS,
    );
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [companyInfoBranch, setCompanyInfoBranch] = useState<string>('');
    const [activeBranchLabel, setActiveBranchLabel] = useState<string>('');

    async function loadCompanyInfoIfNeeded(branch: string) {
      if (!branch || branch === companyInfoBranch) return;
      const info = await fetchCompanyInfo(branch);
      setCompanyInfo(info);
      setCompanyInfoBranch(branch);
    }

    const [journalEntries, setJournalEntries] = useState<JournalEntryRow[]>([]);
    const [journalLoading, setJournalLoading] = useState(false);
    const [journalError, setJournalError] = useState<string | null>(null);

    // --- R1A01 REAL DATA: separate result/loading/error state, kept apart
    // from the journal ones above so neither report type can clobber the
    // other's state.
    const [accountActivityRows, setAccountActivityRows] = useState<AccountActivityRow[]>([]);
    const [accountActivityLoading, setAccountActivityLoading] = useState(false);
    const [accountActivityError, setAccountActivityError] = useState<string | null>(null);
    // --- R1A01 REAL DATA (branch fix): real branches list + selection,
    // same shape/source as R1A02's, reused here.
    const [accountActivityBranches, setAccountActivityBranches] = useState<
      { value: string; label: string }[]
    >([]);
    const [selectedAccountActivityBranch, setSelectedAccountActivityBranch] = useState('MAN');
    // --- R1A01 REAL DATA (journal dropdown fix): real journals list for
    // Journal From/To, same source (m05, branch-filtered) as R1A02's Journal
    // dropdown. The desktop app has these as real dropdowns too, confirmed
    // via screenshot — not free-text fields like we originally built.
    const [accountActivityJournals, setAccountActivityJournals] = useState<JournalOption[]>([]);
    // --- R1A01 REAL DATA (Account ID fix): Chart of Accounts list + selection.
    const [accountActivityAccounts, setAccountActivityAccounts] = useState<
      { value: string; label: string }[]
    >([]);
    const [selectedAccountActivityAccount, setSelectedAccountActivityAccount] = useState('');

    // --- R1A02 REAL DATA: dropdown options (loaded once per report open)
    // plus its own filter selections, result rows, loading/error state —
    // kept separate from both the journal-entries and account-activity
    // state above.
    const [periods, setPeriods] = useState<PeriodOption[]>([]);
    const [journals, setJournals] = useState<JournalOption[]>([]);
    const [unpostedBranches, setUnpostedBranches] = useState<{ value: string; label: string }[]>([]);
    const [selectedJournal, setSelectedJournal] = useState<string>(''); // '' = All
    const [selectedUnpostedBranch, setSelectedUnpostedBranch] = useState<string>('MAN');
    const [selectedPeriodFrom, setSelectedPeriodFrom] = useState<string>('');
    const [selectedPeriodTo, setSelectedPeriodTo] = useState<string>('');
    const [unpostedRows, setUnpostedRows] = useState<UnpostedEntryRow[]>([]);
    const [unpostedLoading, setUnpostedLoading] = useState(false);
    const [unpostedError, setUnpostedError] = useState<string | null>(null);

    // --- R1A04 REAL DATA: own state — kept separate from R1A02's state.
    // Reuses the same dropdown data (periods, journals, branches) loaded
    // by R1A02's loadPeriodsAndJournalsThenReport since the sources are
    // identical (rssys.x03, rssys.m05, rssys.branch).
    const [a104Rows, setA104Rows] = useState<UnpostedEntryRow[]>([]);
    const [a104Loading, setA104Loading] = useState(false);
    const [a104Error, setA104Error] = useState<string | null>(null);
    const [selectedA104Journal, setSelectedA104Journal] = useState<string>('');
    const [selectedA104Branch, setSelectedA104Branch] = useState<string>('MAN');
    const [selectedA104PeriodFrom, setSelectedA104PeriodFrom] = useState<string>('');
    const [selectedA104PeriodTo, setSelectedA104PeriodTo] = useState<string>('');
    const [a104Periods, setA104Periods] = useState<PeriodOption[]>([]);
    const [a104Journals, setA104Journals] = useState<JournalOption[]>([]);
    const [a104Branches, setA104Branches] = useState<{ value: string; label: string }[]>([]);

    // --- R3A02 REAL DATA: own state.
    const [r3a02Rows, setR3a02Rows] = useState<AccountActivityRow[]>([]);
    const [r3a02Loading, setR3a02Loading] = useState(false);
    const [r3a02Error, setR3a02Error] = useState<string | null>(null);
    const [selectedR3a02Branch, setSelectedR3a02Branch] = useState('MAN');
    const [selectedR3a02AccountFrom, setSelectedR3a02AccountFrom] = useState('all');
    const [selectedR3a02AccountTo, setSelectedR3a02AccountTo] = useState('all');
    const [selectedR3a02Journal, setSelectedR3a02Journal] = useState('all');
    const [r3a02Branches, setR3a02Branches] = useState<{ value: string; label: string }[]>([]);
    const [r3a02Accounts, setR3a02Accounts] = useState<{ value: string; label: string }[]>([]);
    const [r3a02Journals, setR3a02Journals] = useState<{ value: string; label: string }[]>([]);

    // --- R3A03 REAL DATA: own state.
    const [r3a03Rows, setR3a03Rows] = useState<AccountActivityRow[]>([]);
    const [r3a03Loading, setR3a03Loading] = useState(false);
    const [r3a03Error, setR3a03Error] = useState<string | null>(null);
    const [selectedR3a03Branch, setSelectedR3a03Branch] = useState('MAN');
    const [selectedR3a03JournalFrom, setSelectedR3a03JournalFrom] = useState('');
    const [selectedR3a03JournalTo, setSelectedR3a03JournalTo] = useState('');
    const [r3a03Branches, setR3a03Branches] = useState<{ value: string; label: string }[]>([]);
    const [r3a03Journals, setR3a03Journals] = useState<{ value: string; label: string }[]>([]);

    // --- R3A04 REAL DATA: own state.
    const [r3a04Rows, setR3a04Rows] = useState<GLSummaryRow[]>([]);
    const [r3a04Loading, setR3a04Loading] = useState(false);
    const [r3a04Error, setR3a04Error] = useState<string | null>(null);
    const [selectedR3a04Branch, setSelectedR3a04Branch] = useState('MAN');
    const [selectedR3a04AccountFrom, setSelectedR3a04AccountFrom] = useState('all');
    const [selectedR3a04AccountTo, setSelectedR3a04AccountTo] = useState('all');
    const [selectedR3a04Journal, setSelectedR3a04Journal] = useState('all');
    const [r3a04Branches, setR3a04Branches] = useState<{ value: string; label: string }[]>([]);
    const [r3a04Accounts, setR3a04Accounts] = useState<{ value: string; label: string }[]>([]);
    const [r3a04Journals, setR3a04Journals] = useState<{ value: string; label: string }[]>([]);

    // --- SUBLEDGER REPORTS: shared + per-report state.
    const [subledgerBranches, setSubledgerBranches] = useState<{ value: string; label: string }[]>([]);
    const [subledgerAccounts, setSubledgerAccounts] = useState<{ value: string; label: string }[]>([]);
    const [subledgerNames, setSubledgerNames] = useState<{ value: string; label: string }[]>([]);

    // R4A02 Balances from Customer
    const [r4a02Rows, setR4a02Rows] = useState<AccountActivityRow[]>([]);
    const [r4a02Loading, setR4a02Loading] = useState(false);
    const [r4a02Error, setR4a02Error] = useState<string | null>(null);
    const [selectedR4a02Branch, setSelectedR4a02Branch] = useState('MAN');
    const [selectedR4a02Account, setSelectedR4a02Account] = useState('all');
    const [selectedR4a02SlFrom, setSelectedR4a02SlFrom] = useState('all');
    const [selectedR4a02SlTo, setSelectedR4a02SlTo] = useState('all');
    const [r4a02AsOf, setR4a02AsOf] = useState('');
    const [r4a02ShowUnposted, setR4a02ShowUnposted] = useState(true);
    const [r4a02ShowPosted, setR4a02ShowPosted] = useState(true);

    // R4A03 Customers Aging Report
    const [r4a03Rows, setR4a03Rows] = useState<AccountActivityRow[]>([]);
    const [r4a03Loading, setR4a03Loading] = useState(false);
    const [r4a03Error, setR4a03Error] = useState<string | null>(null);
    const [selectedR4a03Branch, setSelectedR4a03Branch] = useState('MAN');
    const [selectedR4a03Account, setSelectedR4a03Account] = useState('all');
    const [selectedR4a03SlFrom, setSelectedR4a03SlFrom] = useState('all');
    const [selectedR4a03SlTo, setSelectedR4a03SlTo] = useState('all');
    const [r4a03AsOf, setR4a03AsOf] = useState('');
    const [r4a03SummaryOnly, setR4a03SummaryOnly] = useState(false);
    const [r4a03ShowUnposted, setR4a03ShowUnposted] = useState(true);
    const [r4a03ShowPosted, setR4a03ShowPosted] = useState(true);

    // R4A05 Balances to Supplier
    const [r4a05Rows, setR4a05Rows] = useState<AccountActivityRow[]>([]);
    const [r4a05Loading, setR4a05Loading] = useState(false);
    const [r4a05Error, setR4a05Error] = useState<string | null>(null);
    const [selectedR4a05Branch, setSelectedR4a05Branch] = useState('MAN');
    const [selectedR4a05Account, setSelectedR4a05Account] = useState('all');
    const [selectedR4a05SlFrom, setSelectedR4a05SlFrom] = useState('all');
    const [selectedR4a05SlTo, setSelectedR4a05SlTo] = useState('all');
    const [r4a05AsOf, setR4a05AsOf] = useState('');
    const [r4a05ShowUnposted, setR4a05ShowUnposted] = useState(true);
    const [r4a05ShowPosted, setR4a05ShowPosted] = useState(true);

    // R4A06 Suppliers Aging Report
    const [r4a06Rows, setR4a06Rows] = useState<AccountActivityRow[]>([]);
    const [r4a06Loading, setR4a06Loading] = useState(false);
    const [r4a06Error, setR4a06Error] = useState<string | null>(null);
    const [selectedR4a06Branch, setSelectedR4a06Branch] = useState('MAN');
    const [selectedR4a06Account, setSelectedR4a06Account] = useState('all');
    const [selectedR4a06SlFrom, setSelectedR4a06SlFrom] = useState('all');
    const [selectedR4a06SlTo, setSelectedR4a06SlTo] = useState('all');
    const [r4a06AsOf, setR4a06AsOf] = useState('');
    const [r4a06SummaryOnly, setR4a06SummaryOnly] = useState(false);
    const [r4a06ShowUnposted, setR4a06ShowUnposted] = useState(true);
    const [r4a06ShowPosted, setR4a06ShowPosted] = useState(true);

    // --- FINANCIAL STATEMENTS REPORTS: shared state.
    const [financialRows, setFinancialRows] = useState<FinancialStatementRow[]>([]);
    const [financialLoading, setFinancialLoading] = useState(false);
    const [financialError, setFinancialError] = useState<string | null>(null);
    const [financialBranches, setFinancialBranches] = useState<{ value: string; label: string }[]>([]);
    const [financialPeriods, setFinancialPeriods] = useState<PeriodOption[]>([]);
    const [financialYears, setFinancialYears] = useState<{ value: string; label: string }[]>([]);
    const [selectedFinancialBranch, setSelectedFinancialBranch] = useState('MAN');
    const [selectedFinancialPeriodFrom, setSelectedFinancialPeriodFrom] = useState('');
    const [selectedFinancialPeriodTo, setSelectedFinancialPeriodTo] = useState('');
    const [selectedFinancialYear, setSelectedFinancialYear] = useState('');
    const [selectedFinancialViewAs, setSelectedFinancialViewAs] = useState('posted');
    const [financialYearToDate, setFinancialYearToDate] = useState(false);
    const [financialCompareBudget, setFinancialCompareBudget] = useState(false);
    const [currentFinancialCode, setCurrentFinancialCode] = useState<string | null>(null);

    // --- R3A01 REAL DATA: own state.
    const [r3a01Rows, setR3a01Rows] = useState<AccountActivityRow[]>([]);
    const [r3a01Loading, setR3a01Loading] = useState(false);
    const [r3a01Error, setR3a01Error] = useState<string | null>(null);
    const [selectedR3a01Branch, setSelectedR3a01Branch] = useState('MAN');
    const [selectedR3a01Period, setSelectedR3a01Period] = useState('');
    const [r3a01Branches, setR3a01Branches] = useState<{ value: string; label: string }[]>([]);
    const [r3a01Periods, setR3a01Periods] = useState<PeriodOption[]>([]);

    // --- R2A03 REAL DATA: own state — adds Journal Book.
    const [r2a03Rows, setR2a03Rows] = useState<CheckEntryRow[]>([]);
    const [r2a03Loading, setR2a03Loading] = useState(false);
    const [r2a03Error, setR2a03Error] = useState<string | null>(null);
    const [selectedR2a03Branch, setSelectedR2a03Branch] = useState('MAN');
    const [selectedR2a03AccountFrom, setSelectedR2a03AccountFrom] = useState('all');
    const [selectedR2a03AccountTo, setSelectedR2a03AccountTo] = useState('all');
    const [selectedR2a03JournalBook, setSelectedR2a03JournalBook] = useState('all');
    const [r2a03Branches, setR2a03Branches] = useState<{ value: string; label: string }[]>([]);
    const [r2a03Accounts, setR2a03Accounts] = useState<{ value: string; label: string }[]>([]);
    const [r2a03JournalBooks, setR2a03JournalBooks] = useState<{ value: string; label: string }[]>([]);

    // --- R2A02 REAL DATA: own state — same shape as R2A01.
    const [r2a02Rows, setR2a02Rows] = useState<CheckEntryRow[]>([]);
    const [r2a02Loading, setR2a02Loading] = useState(false);
    const [r2a02Error, setR2a02Error] = useState<string | null>(null);
    const [selectedR2a02Branch, setSelectedR2a02Branch] = useState('MAN');
    const [selectedR2a02AccountFrom, setSelectedR2a02AccountFrom] = useState('all');
    const [selectedR2a02AccountTo, setSelectedR2a02AccountTo] = useState('all');
    const [r2a02Branches, setR2a02Branches] = useState<{ value: string; label: string }[]>([]);
    const [r2a02Accounts, setR2a02Accounts] = useState<{ value: string; label: string }[]>([]);

    // --- R2A01 REAL DATA: own state.
    const [r2a01Rows, setR2a01Rows] = useState<CheckEntryRow[]>([]);
    const [r2a01Loading, setR2a01Loading] = useState(false);
    const [r2a01Error, setR2a01Error] = useState<string | null>(null);
    const [selectedR2a01Branch, setSelectedR2a01Branch] = useState('MAN');
    const [selectedR2a01AccountFrom, setSelectedR2a01AccountFrom] = useState('all');
    const [selectedR2a01AccountTo, setSelectedR2a01AccountTo] = useState('all');
    const [r2a01Branches, setR2a01Branches] = useState<{ value: string; label: string }[]>([]);
    const [r2a01Accounts, setR2a01Accounts] = useState<{ value: string; label: string }[]>([]);

    // --- R1A085 REAL DATA: own state — same shape as R1A083.
    const [a085Rows, setA085Rows] = useState<UnbalanceJournalRow[]>([]);
    const [a085Loading, setA085Loading] = useState(false);
    const [a085Error, setA085Error] = useState<string | null>(null);
    const [selectedA085Branch, setSelectedA085Branch] = useState('MAN');
    const [selectedA085Period, setSelectedA085Period] = useState('');
    const [a085Branches, setA085Branches] = useState<{ value: string; label: string }[]>([]);
    const [a085Periods, setA085Periods] = useState<PeriodOption[]>([]);

    // --- R1A084 REAL DATA: own state.
    const [a084Rows, setA084Rows] = useState<UnbalanceJournalRow[]>([]);
    const [a084Loading, setA084Loading] = useState(false);
    const [a084Error, setA084Error] = useState<string | null>(null);
    const [selectedA084Branch, setSelectedA084Branch] = useState('MAN');
    const [selectedA084Period, setSelectedA084Period] = useState('');
    const [a084Branches, setA084Branches] = useState<{ value: string; label: string }[]>([]);
    const [a084Periods, setA084Periods] = useState<PeriodOption[]>([]);

    // --- R1A083 REAL DATA: own state.
    const [a083Rows, setA083Rows] = useState<UnbalanceJournalRow[]>([]);
    const [a083Loading, setA083Loading] = useState(false);
    const [a083Error, setA083Error] = useState<string | null>(null);
    const [selectedA083Branch, setSelectedA083Branch] = useState('MAN');
    const [selectedA083Period, setSelectedA083Period] = useState('');
    const [a083Branches, setA083Branches] = useState<{ value: string; label: string }[]>([]);
    const [a083Periods, setA083Periods] = useState<PeriodOption[]>([]);

    // --- R1A082 REAL DATA: own state — same shape as R1A081.
    const [a082Rows, setA082Rows] = useState<UnbalanceJournalRow[]>([]);
    const [a082Loading, setA082Loading] = useState(false);
    const [a082Error, setA082Error] = useState<string | null>(null);
    const [selectedA082Branch, setSelectedA082Branch] = useState('MAN');
    const [selectedA082Account, setSelectedA082Account] = useState('all');
    const [a082Branches, setA082Branches] = useState<{ value: string; label: string }[]>([]);
    const [a082Accounts, setA082Accounts] = useState<{ value: string; label: string }[]>([]);

    // --- R1A081 REAL DATA: own state.
    const [a081Rows, setA081Rows] = useState<UnbalanceJournalRow[]>([]);
    const [a081Loading, setA081Loading] = useState(false);
    const [a081Error, setA081Error] = useState<string | null>(null);
    const [selectedA081Branch, setSelectedA081Branch] = useState('MAN');
    const [selectedA081Account, setSelectedA081Account] = useState('all');
    const [a081Branches, setA081Branches] = useState<{ value: string; label: string }[]>([]);
    const [a081Accounts, setA081Accounts] = useState<{ value: string; label: string }[]>([]);

    // --- R1A07 REAL DATA: own state — Entry Dates only, no branch needed.
    const [a107Rows, setA107Rows] = useState<AccountActivityRow[]>([]);
    const [a107Loading, setA107Loading] = useState(false);
    const [a107Error, setA107Error] = useState<string | null>(null);

    // --- R1A061 REAL DATA: own state.
    const [a061Rows, setA061Rows] = useState<AccountActivityRow[]>([]);
    const [a061Loading, setA061Loading] = useState(false);
    const [a061Error, setA061Error] = useState<string | null>(null);
    const [selectedA061Branch, setSelectedA061Branch] = useState('MAN');
    const [a061Branches, setA061Branches] = useState<{ value: string; label: string }[]>([]);

    // --- R1A06 REAL DATA: own state — kept separate from R1A01/R1A05 state.
    const [a106Rows, setA106Rows] = useState<AccountActivityRow[]>([]);
    const [a106Loading, setA106Loading] = useState(false);
    const [a106Error, setA106Error] = useState<string | null>(null);
    const [selectedA106Branch, setSelectedA106Branch] = useState('MAN');
    const [a106Branches, setA106Branches] = useState<{ value: string; label: string }[]>([]);

    // --- R1A05 REAL DATA: own state — kept separate from R1A01's state.
    const [a105Rows, setA105Rows] = useState<AccountActivityRow[]>([]);
    const [a105Loading, setA105Loading] = useState(false);
    const [a105Error, setA105Error] = useState<string | null>(null);
    const [selectedA105Branch, setSelectedA105Branch] = useState('MAN');
    const [a105Branches, setA105Branches] = useState<{ value: string; label: string }[]>([]);
    const [a105Journals, setA105Journals] = useState<JournalOption[]>([]);

    // --- R1A03 REAL DATA: own result/loading/error state, own dropdown data,
    // own selections — kept separate from R1A01/R1A02's state.
    const [cashPositionRows, setCashPositionRows] = useState<CashPositionRow[]>([]);
    const [cashPositionLoading, setCashPositionLoading] = useState(false);
    const [cashPositionError, setCashPositionError] = useState<string | null>(null);
    const [selectedCashPositionBranch, setSelectedCashPositionBranch] = useState('MAN');
    const [cashPositionBranches, setCashPositionBranches] = useState<
      { value: string; label: string }[]
    >([]);
    const [cashPositionAccounts, setCashPositionAccounts] = useState<
      { value: string; label: string }[]
    >([]);
    const [selectedCashPositionAccount, setSelectedCashPositionAccount] = useState('');
    const [cashPositionFyOptions, setCashPositionFyOptions] = useState<number[]>([]);
    const [selectedCashPositionFy, setSelectedCashPositionFy] = useState('all');
    const [includePreviousCashPosition, setIncludePreviousCashPosition] = useState(false);

    // --- SALES REAL DATA: OTC Sales Report (R1000/R1S00/R2000/R2S00) state.
    const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
    const [salesLoading, setSalesLoading] = useState(false);
    const [salesError, setSalesError] = useState<string | null>(null);

    async function loadOTCSales(
      branch: string,
      outlet: string,
      dateFrom: string,
      dateTo: string,
      viewAs: string,
      staffFrom?: string,
      staffTo?: string,
    ) {
      if (!branch) {
        setSalesError('Please select a Branch.');
        return;
      }
      if (!dateFrom || !dateTo) {
        setSalesError('Please select both Sales Date From and To.');
        return;
      }
      // FIX: this call was missing here — every other report's load
      // function calls loadCompanyInfoIfNeeded(branch), which is what
      // populates the real company name/branch name in the printed
      // header. Without it, the header silently fell back to literal
      // placeholder text ("Company Name" / "Branch Name") since
      // companyInfo was never being set for this report.
      void loadCompanyInfoIfNeeded(branch);
      setSalesLoading(true);
      setSalesError(null);
      try {
        const rows = await fetchOTCSales(branch, outlet, dateFrom, dateTo, viewAs, staffFrom, staffTo);
        setSalesRows(rows);
      } catch (err: any) {
        setSalesError(err?.message || 'Something went wrong.');
        setSalesRows([]);
      } finally {
        setSalesLoading(false);
      }
    }

    // --- INVENTORY REAL DATA: shared state across all 26 Inventory Report
    // codes. Only R1I01-03 (Purchase Request Reports) have a real backend
    // endpoint so far — everything else surfaces a clear "not built yet"
    // error instead of silently showing empty/wrong data.
    const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [inventoryError, setInventoryError] = useState<string | null>(null);

    async function loadInventoryReport(
      reportCode: string,
      branch: string,
      dateFrom: string,
      dateTo: string,
      prFrom?: string,
      prTo?: string,
      itemCode?: string,
      supplier?: string,
      rrFrom?: string,
      rrTo?: string,
      cntFrom?: string,
      cntTo?: string,
      warehouse?: string,
      itemGrp?: string,
      asOf?: string,
      negativeOnly?: boolean,
      zeroCostOnly?: boolean,
    ) {
      if (!branch) {
        setInventoryError('Please select a Branch.');
        return;
      }
      // --- R10I00 ONLY: single "As Of" date required instead of the
      // base Dates From/To pair (Valuation is a point-in-time
      // snapshot). Every other Inventory report requires the base
      // date range.
      if (reportCode === 'R10I00') {
        if (!asOf) {
          setInventoryError('Please select an As Of date.');
          return;
        }
      } else if (!dateFrom || !dateTo) {
        setInventoryError('Please select both Transaction Dates From and To.');
        return;
      }
      // --- R1I02 ONLY: PR Number From/To is required, same as the base
      // Branch/Date fields — no "All" default exists on desktop (I012).
      if (reportCode === 'R1I02' && (!prFrom || !prTo)) {
        setInventoryError('Please select both Purchase Request Number From and To.');
        return;
      }
      // --- R4I02 ONLY: Direct Purchase Number From/To is required, same
      // pattern as R1I02 (reuses prFrom/prTo).
      if (reportCode === 'R4I02' && (!prFrom || !prTo)) {
        setInventoryError('Please select both Direct Purchase Number From and To.');
        return;
      }
      // --- R5I02 ONLY: Issuance Number From/To is required, same
      // pattern as R1I02/R4I02 (reuses prFrom/prTo).
      if (reportCode === 'R5I02' && (!prFrom || !prTo)) {
        setInventoryError('Please select both Issuance Number From and To.');
        return;
      }
      // --- R6I02 ONLY: Transfer Number From/To is required, same
      // pattern as the other range filters (reuses prFrom/prTo).
      if (reportCode === 'R6I02' && (!prFrom || !prTo)) {
        setInventoryError('Please select both Transfer Number From and To.');
        return;
      }
      // --- R7I02 ONLY: Adjustment Number From/To is required, same
      // pattern as the other range filters (reuses prFrom/prTo).
      if (reportCode === 'R7I02' && (!prFrom || !prTo)) {
        setInventoryError('Please enter both Adjustment Number From and To.');
        return;
      }
      // --- R1I03 / R2I04 / R3I03 / R4I04 / R5I03 / R6I03 / R7I03 ONLY:
      // Items is a required single-select, confirmed via desktop
      // screenshots (I013/I024) — no "All" option.
      if ((reportCode === 'R1I03' || reportCode === 'R2I04' || reportCode === 'R3I03' || reportCode === 'R4I04' || reportCode === 'R5I03' || reportCode === 'R6I03' || reportCode === 'R7I03') && !itemCode) {
        setInventoryError('Please select an Item.');
        return;
      }
      // --- R2I03 / R4I03 ONLY: Supplier is a required single-select,
      // confirmed via desktop screenshot (I023) — no "All" option shown.
      if ((reportCode === 'R2I03' || reportCode === 'R4I03') && !supplier) {
        setInventoryError('Please select a Supplier.');
        return;
      }
      // --- R3I02 ONLY: RR Number From/To is required, same pattern as
      // R1I02 — no "All" default exists on desktop (I032).
      if (reportCode === 'R3I02' && (!rrFrom || !rrTo)) {
        setInventoryError('Please select both RR Number From and To.');
        return;
      }
      // --- R5I04 ONLY: Cost Center From/To is required, same pattern
      // as the other range filters.
      if (reportCode === 'R5I04' && (!cntFrom || !cntTo)) {
        setInventoryError('Please select both Cost Center From and To.');
        return;
      }
      setInventoryLoading(true);
      setInventoryError(null);
      try {
        const rows = await fetchInventoryReport(reportCode, branch, dateFrom, dateTo, prFrom, prTo, itemCode, supplier, rrFrom, rrTo, cntFrom, cntTo, warehouse, itemGrp, asOf, negativeOnly, zeroCostOnly);
        setInventoryRows(rows);
      } catch (err: any) {
        setInventoryError(err?.message || 'Something went wrong.');
        setInventoryRows([]);
      } finally {
        setInventoryLoading(false);
      }
    }

    useEffect(() => {
      const checkTheme = () => {
        setIsDark(document.documentElement.classList.contains('dark'));
      };

      checkTheme();

      const observer = new MutationObserver(checkTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });

      return () => observer.disconnect();
    }, []);

    const group = reportsData.find((g) => g.key === groupKey) ?? null;
    const subCategory = group?.subCategories.find((s) => s.key === subKey) ?? null;

    const allItemsInSubCategory = useMemo(() => {
      if (!subCategory) return [];
      return subCategory.sections.flatMap((section) => section.items);
    }, [subCategory]);

    const selectedReport =
      allItemsInSubCategory.find((item) => item.code === reportCode) ?? null;

    const filteredSubs = useMemo(() => {
      if (!group) return [];
      const q = subSearch.trim().toLowerCase();
      if (!q) return group.subCategories;
      return group.subCategories.filter((s) => s.label.toLowerCase().includes(q));
    }, [group, subSearch]);

    const filteredSections = useMemo(() => {
      if (!subCategory) return [];
      const q = itemSearch.trim().toLowerCase();
      if (!q) return subCategory.sections;
      return subCategory.sections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.name.toLowerCase().includes(q) ||
              item.code.toLowerCase().includes(q),
          ),
        }))
        .filter((section) => section.items.length > 0);
    }, [subCategory, itemSearch]);

    function selectGroup(key: string) {
      setGroupKey(key);
      setSubKey(null);
      setSubSearch('');
      setItemSearch('');
      setReportCode(null);
    }

    function selectSub(key: string) {
      setSubKey(key);
      setItemSearch('');
      setReportCode(null);
    }

    // --- R1A01 REAL DATA: shared loader, used both for the auto-load on
    // open and for the Preview button's re-fetch.
    async function loadAccountActivity(filters: JournalFilters, branch: string, accountId: string) {
      setAccountActivityLoading(true);
      setAccountActivityError(null);
      try {
        const rows = await fetchAccountActivity(filters, branch, accountId || undefined);
        setAccountActivityRows(rows);
      } catch (err: any) {
        setAccountActivityError(err?.message || 'Something went wrong.');
        setAccountActivityRows([]);
      } finally {
        setAccountActivityLoading(false);
      }
    }

    // --- R1A01 REAL DATA (branch + Account ID fix): loads the real branch
    // list, the FULL journal list (no branch filter — matches desktop), and
    // the real Chart of Accounts (also company-wide, m04.branch is empty).
    async function loadAccountActivityBranchesThenReport(filters: JournalFilters, branch: string) {
      setAccountActivityLoading(true);
      setAccountActivityError(null);
      try {
        const [b, j, a] = await Promise.all([
          fetchBranches(),
          fetchJournals(),
          fetchChartOfAccounts(),
        ]);
        setAccountActivityBranches(b);
        setAccountActivityJournals(j);
        setAccountActivityAccounts(a);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        setSelectedAccountActivityBranch(validBranch);

        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);

        await loadAccountActivity(filters, validBranch, selectedAccountActivityAccount);
      } catch (err: any) {
        setAccountActivityError(err?.message || 'Failed to load branches/journals/accounts.');
        setAccountActivityLoading(false);
      }
    }

    // --- R1A01 REAL DATA (branch fix): branch changed. Journal From/To and
    // Account ID deliberately do NOT refetch/filter by branch here —
    // matches the desktop app, where both stay the same full combined list
    // regardless of which branch is selected.
    async function handleAccountActivityBranchChange(branch: string) {
      const branchLabelText = accountActivityBranches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedAccountActivityBranch(branch);
      await loadAccountActivity(journalFilters, branch, selectedAccountActivityAccount);
    }

    // --- R1A01 REAL DATA (Account ID fix): account selection changed.
    async function handleAccountActivityAccountChange(accountId: string) {
      const cleaned = accountId === 'all' ? '' : accountId;
      setSelectedAccountActivityAccount(cleaned);
      await loadAccountActivity(journalFilters, selectedAccountActivityBranch, cleaned);
    }

    // --- R1A02 REAL DATA: shared loader for the report rows themselves,
    // used both for the auto-load on open and the Preview button's re-fetch.
    async function loadUnpostedEntries(
      periodFrom: string,
      periodTo: string,
      jCode: string,
      branch: string,
    ) {
      setUnpostedLoading(true);
      setUnpostedError(null);
      try {
        const rows = await fetchListOfUnpostedEntries({
          periodFrom,
          periodTo,
          jCode: jCode || undefined,
          branch: branch || undefined,
        });
        setUnpostedRows(rows);
      } catch (err: any) {
        setUnpostedError(err?.message || 'Something went wrong.');
        setUnpostedRows([]);
      } finally {
        setUnpostedLoading(false);
      }
    }

    // Loads the Period/Journal dropdown options once, then auto-loads the
    // report for the current fiscal period — same "auto-load on open"
    // pattern as A101, just with an extra dropdown-population step first.
    //
    // Journal list is now UNFILTERED (matching A101's fix and the real
    // desktop app) — full 32 entries combined across branches, not scoped
    // to the selected branch.
    async function loadPeriodsAndJournalsThenReport(defaultPeriod: string, branch: string) {
      setUnpostedLoading(true);
      setUnpostedError(null);
      try {
        const [p, j, b] = await Promise.all([
          fetchAccountingPeriods(),
          fetchJournals(),
          fetchBranches(),
        ]);
        setPeriods(p);
        setJournals(j);
        setUnpostedBranches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        await loadUnpostedEntries(defaultPeriod, defaultPeriod, '', validBranch);
      } catch (err: any) {
        setUnpostedError(err?.message || 'Failed to load periods/journals/branches.');
        setUnpostedLoading(false);
      }
    }

    // --- Branch changed. Journal list deliberately does NOT refetch/filter
    // by branch here anymore — matches A101 and the desktop app, where the
    // Journal list stays the same full combined list regardless of branch.
    //
    // FIX: selectedJournal IS now reset to '' (All) on branch change. Before
    // this fix, switching branches kept whatever journal was previously
    // selected — e.g. picking "BUT-CBD" (a Butuan journal) then switching
    // Branch to Mandaue would silently submit branch=MAN with j_code=BUT-CBD,
    // a combination that can never match any real row, producing a
    // misleading "No records available" even when real Mandaue unposted
    // entries exist. Resetting to All on branch change avoids this trap
    // while still preserving the desktop's un-filtered combined Journal list.
    async function handleUnpostedBranchChange(branch: string) {
      const branchLabelText = unpostedBranches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedUnpostedBranch(branch);
      setSelectedJournal('');
      await loadUnpostedEntries(selectedPeriodFrom, selectedPeriodTo, '', branch);
    }

    // --- R1A04 REAL DATA: loaders — same pattern as R1A02.
    async function loadA104Entries(
      periodFrom: string,
      periodTo: string,
      jCode: string,
      branch: string,
    ) {
      setA104Loading(true);
      setA104Error(null);
      try {
        const rows = await fetchUnpostedEntriesA104({
          periodFrom,
          periodTo,
          jCode: jCode || undefined,
          branch: branch || undefined,
        });
        setA104Rows(rows);
      } catch (err: any) {
        setA104Error(err?.message || 'Something went wrong.');
        setA104Rows([]);
      } finally {
        setA104Loading(false);
      }
    }

    async function loadA104PeriodsAndJournalsThenReport(defaultPeriod: string, branch: string) {
      setA104Loading(true);
      setA104Error(null);
      try {
        const [p, j, b] = await Promise.all([
          fetchAccountingPeriods(),
          fetchJournals(),
          fetchBranches(),
        ]);
        setA104Periods(p);
        setA104Journals(j);
        setA104Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        await loadA104Entries(defaultPeriod, defaultPeriod, '', validBranch);
      } catch (err: any) {
        setA104Error(err?.message || 'Failed to load periods/journals/branches.');
        setA104Loading(false);
      }
    }

    // FIX: same stale-cross-branch-journal trap as R1A02's
    // handleUnpostedBranchChange, fixed the same way — see that function's
    // comment for the full explanation.
    async function handleA104BranchChange(branch: string) {
      const branchLabelText = a104Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA104Branch(branch);
      setSelectedA104Journal('');
      await loadA104Entries(selectedA104PeriodFrom, selectedA104PeriodTo, '', branch);
    }

    // --- R3A03 REAL DATA: GL by Journal ID fetch.
  async function fetchGLByJournalID(
    filters: JournalFilters,
    branch?: string,
  ): Promise<AccountActivityRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    if (filters.journalFrom) params.set('journal_from', filters.journalFrom);
    if (filters.journalTo) params.set('journal_to', filters.journalTo);
    params.set('entry_date_from', filters.dateFrom);
    params.set('entry_date_to', filters.dateTo);
    params.set('unposted', String(filters.showUnposted));
    params.set('posted', String(filters.showPosted));
    if (branch) params.set('branch', branch);

    const res = await fetch(
      `${API_URL}/approval/reports/gl-activity-by-journal-id/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load GL by journal ID.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  async function fetchGLSummaryByAccountID(
    dateFrom: string,
    dateTo: string,
    branch?: string,
    atCodeFrom?: string,
    atCodeTo?: string,
    jCode?: string,
  ): Promise<GLSummaryRow[]> {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant =
      typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;

    const params = new URLSearchParams();
    params.set('entry_date_from', dateFrom);
    params.set('entry_date_to', dateTo);
    if (branch) params.set('branch', branch);
    if (atCodeFrom) params.set('at_code_from', atCodeFrom);
    if (atCodeTo) params.set('at_code_to', atCodeTo);
    if (jCode) params.set('j_code', jCode);

    const res = await fetch(
      `${API_URL}/approval/reports/gl-summary-by-account-id/?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      },
    );

    const result = await res.json();

    if (!res.ok || result.status === 'error') {
      throw new Error(result?.message || 'Failed to load GL summary by account ID.');
    }

    return Array.isArray(result.data) ? result.data : [];
  }

  async function fetchSubledgerAccounts(): Promise<{ value: string; label: string }[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
    const res = await fetch(`${API_URL}/approval/reports/subledger-accounts/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });
    const result = await res.json();
    if (!res.ok || result.status === 'error') throw new Error(result?.message || 'Failed to load subledger accounts.');
    return Array.isArray(result.accounts) ? result.accounts : [];
  }

  async function fetchSubledgerNames(atCode?: string, branch?: string): Promise<{ value: string; label: string }[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
    const params = new URLSearchParams();
    if (atCode && atCode !== 'all') params.set('at_code', atCode);
    if (branch) params.set('branch', branch);
    const res = await fetch(`${API_URL}/approval/reports/subledger-names/?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });
    const result = await res.json();
    if (!res.ok || result.status === 'error') throw new Error(result?.message || 'Failed to load subledger names.');
    return Array.isArray(result.names) ? result.names : [];
  }

  async function fetchSubledgerReport(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<AccountActivityRow[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/approval/reports/${endpoint}/?${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });
    const result = await res.json();
    if (!res.ok || result.status === 'error') throw new Error(result?.message || 'Failed to load report.');
    return Array.isArray(result.data) ? result.data : [];
  }

  async function fetchFinancialReport(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<FinancialStatementRow[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API_URL}/approval/reports/financial/${endpoint}/?${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });
    const result = await res.json();
    if (!res.ok || result.status === 'error') throw new Error(result?.message || 'Failed to load financial report.');
    return Array.isArray(result.data) ? result.data : [];
  }

  async function fetchFinancialYears(): Promise<{ value: string; label: string }[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
    const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
    const res = await fetch(`${API_URL}/approval/reports/financial/years/`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'X-Tenant': tenant } : {}),
      },
    });
    const result = await res.json();
    if (!res.ok || result.status === 'error') return [];
    return Array.isArray(result.years) ? result.years : [];
  }

    // --- R3A02 REAL DATA: loaders.
    async function loadGLActivityByAccountID(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCodeFrom: string,
      jCode: string,
    ) {
      setR3a02Loading(true);
      setR3a02Error(null);
      try {
        const rows = await fetchGLActivityByAccountID(
          dateFrom, dateTo,
          branch || undefined,
          atCodeFrom !== 'all' ? atCodeFrom : undefined,
          jCode !== 'all' ? jCode : undefined,
        );
        setR3a02Rows(rows);
      } catch (err: any) {
        setR3a02Error(err?.message || 'Something went wrong.');
        setR3a02Rows([]);
      } finally {
        setR3a02Loading(false);
      }
    }

    async function loadR3a02DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setR3a02Loading(true);
      setR3a02Error(null);
      try {
        const [b, a, j] = await Promise.all([
          fetchBranches(),
          fetchChartOfAccounts(),
          fetchJournals(),
        ]);
        setR3a02Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR3a02Accounts(a);
        setR3a02Journals(j.map((jj) => ({ value: jj.value, label: jj.label })));
        await loadGLActivityByAccountID(dateFrom, dateTo, validBranch, 'all', 'all');
      } catch (err: any) {
        setR3a02Error(err?.message || 'Failed to load dropdowns.');
        setR3a02Loading(false);
      }
    }

    async function handleR3a02BranchChange(branch: string) {
      const branchLabelText = r3a02Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR3a02Branch(branch);
      const today = formatLocalDate(new Date());
      await loadGLActivityByAccountID(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedR3a02AccountFrom,
        selectedR3a02Journal,
      );
    }

    // --- R3A03 REAL DATA: loaders + handlers.
    async function loadGLByJournalID(filters: JournalFilters, branch: string) {
      setR3a03Loading(true);
      setR3a03Error(null);
      try {
        const rows = await fetchGLByJournalID(filters, branch || undefined);
        setR3a03Rows(rows);
      } catch (err: any) {
        setR3a03Error(err?.message || 'Something went wrong.');
        setR3a03Rows([]);
      } finally {
        setR3a03Loading(false);
      }
    }

    async function loadR3a03DropdownsThenReport(filters: JournalFilters, branch: string) {
      setR3a03Loading(true);
      setR3a03Error(null);
      try {
        const [b, j] = await Promise.all([fetchBranches(), fetchJournals()]);
        setR3a03Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR3a03Journals(j);
        await loadGLByJournalID(filters, validBranch);
      } catch (err: any) {
        setR3a03Error(err?.message || 'Failed to load dropdowns.');
        setR3a03Loading(false);
      }
    }

    async function handleR3a03BranchChange(branch: string) {
      const branchLabelText = r3a03Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR3a03Branch(branch);
      await loadGLByJournalID(journalFilters, branch);
    }

    async function handlePreviewR3a03() {
      await loadGLByJournalID(journalFilters, selectedR3a03Branch);
    }

    function handleClearR3a03Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR3a03JournalFrom('');
      setSelectedR3a03JournalTo('');
      setR3a03Rows([]);
      setR3a03Error(null);
    }

    // --- R3A04 REAL DATA: loaders + handlers.
    async function loadGLSummaryByAccountID(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCodeFrom: string,
      atCodeTo: string,
      jCode: string,
    ) {
      setR3a04Loading(true);
      setR3a04Error(null);
      try {
        const rows = await fetchGLSummaryByAccountID(
          dateFrom, dateTo,
          branch || undefined,
          atCodeFrom !== 'all' ? atCodeFrom : undefined,
          atCodeTo !== 'all' ? atCodeTo : undefined,
          jCode !== 'all' ? jCode : undefined,
        );
        setR3a04Rows(rows);
      } catch (err: any) {
        setR3a04Error(err?.message || 'Something went wrong.');
        setR3a04Rows([]);
      } finally {
        setR3a04Loading(false);
      }
    }

    async function loadR3a04DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setR3a04Loading(true);
      setR3a04Error(null);
      try {
        const [b, a, j] = await Promise.all([
          fetchBranches(),
          fetchChartOfAccounts(),
          fetchJournals(),
        ]);
        setR3a04Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR3a04Accounts(a);
        setR3a04Journals(j);
        await loadGLSummaryByAccountID(dateFrom, dateTo, validBranch, 'all', 'all', 'all');
      } catch (err: any) {
        setR3a04Error(err?.message || 'Failed to load dropdowns.');
        setR3a04Loading(false);
      }
    }

    async function handleR3a04BranchChange(branch: string) {
      const branchLabelText = r3a04Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR3a04Branch(branch);
      const today = formatLocalDate(new Date());
      await loadGLSummaryByAccountID(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedR3a04AccountFrom,
        selectedR3a04AccountTo,
        selectedR3a04Journal,
      );
    }

    async function handlePreviewR3a04() {
      const today = formatLocalDate(new Date());
      await loadGLSummaryByAccountID(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedR3a04Branch,
        selectedR3a04AccountFrom,
        selectedR3a04AccountTo,
        selectedR3a04Journal,
      );
    }

    function handleClearR3a04Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR3a04AccountFrom('all');
      setSelectedR3a04AccountTo('all');
      setSelectedR3a04Journal('all');
      setR3a04Rows([]);
      setR3a04Error(null);
    }

    // --- SUBLEDGER REPORTS: shared loader for dropdowns.
    async function loadSubledgerDropdowns() {
      try {
        const [b, a, n] = await Promise.all([
          fetchBranches(),
          fetchSubledgerAccounts(),
          fetchSubledgerNames(),
        ]);
        setSubledgerBranches(b);
        setSubledgerAccounts(a);
        setSubledgerNames(n);
      } catch (err: any) {
        console.error('Subledger dropdown load failed:', err?.message);
      }
    }

    // R4A02 — Balances from Customer
    async function loadR4a02Report(asOf: string, branch: string, account: string, slFrom: string, slTo: string, unposted: boolean, posted: boolean) {
      if (!asOf) { setR4a02Error('Please select an As Of date.'); return; }
      // FIX: missing header company/branch name — same root cause as
      // OTC Sales Report's fix earlier. None of the 4 subledger report
      // loaders (R4A02/03/05/06) called this, so their printed headers
      // always fell back to literal "Company Name"/"Branch Name". Both
      // halves of the header need setting separately: company name via
      // loadCompanyInfoIfNeeded, and branch label via a lookup against
      // this report's own loaded branches list.
      const branchLabelText = subledgerBranches.find((b) => b.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setR4a02Loading(true); setR4a02Error(null);
      try {
        const params: Record<string, string> = { as_of: asOf, unposted: String(unposted), posted: String(posted) };
        if (branch) params.branch = branch;
        if (account !== 'all') params.at_code = account;
        if (slFrom !== 'all') params.sl_name_from = slFrom;
        if (slTo !== 'all') params.sl_name_to = slTo;
        const rows = await fetchSubledgerReport('balances-from-customer', params);
        setR4a02Rows(rows);
      } catch (err: any) { setR4a02Error(err?.message || 'Something went wrong.'); setR4a02Rows([]); }
      finally { setR4a02Loading(false); }
    }

    // R4A03 — Customers Aging Report
    async function loadR4a03Report(asOf: string, branch: string, account: string, slFrom: string, slTo: string, summaryOnly: boolean, unposted: boolean, posted: boolean) {
      if (!asOf) { setR4a03Error('Please select an As Of date.'); return; }
      const branchLabelText = subledgerBranches.find((b) => b.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setR4a03Loading(true); setR4a03Error(null);
      try {
        const params: Record<string, string> = { as_of: asOf, summary_only: String(summaryOnly), unposted: String(unposted), posted: String(posted) };
        if (branch) params.branch = branch;
        if (account !== 'all') params.at_code = account;
        if (slFrom !== 'all') params.sl_name_from = slFrom;
        if (slTo !== 'all') params.sl_name_to = slTo;
        const rows = await fetchSubledgerReport('customers-aging-report', params);
        setR4a03Rows(rows);
      } catch (err: any) { setR4a03Error(err?.message || 'Something went wrong.'); setR4a03Rows([]); }
      finally { setR4a03Loading(false); }
    }

    // R4A05 — Balances to Supplier
    async function loadR4a05Report(asOf: string, branch: string, account: string, slFrom: string, slTo: string, unposted: boolean, posted: boolean) {
      if (!asOf) { setR4a05Error('Please select an As Of date.'); return; }
      const branchLabelText = subledgerBranches.find((b) => b.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setR4a05Loading(true); setR4a05Error(null);
      try {
        const params: Record<string, string> = { as_of: asOf, unposted: String(unposted), posted: String(posted) };
        if (branch) params.branch = branch;
        if (account !== 'all') params.at_code = account;
        if (slFrom !== 'all') params.sl_name_from = slFrom;
        if (slTo !== 'all') params.sl_name_to = slTo;
        const rows = await fetchSubledgerReport('balances-to-supplier', params);
        setR4a05Rows(rows);
      } catch (err: any) { setR4a05Error(err?.message || 'Something went wrong.'); setR4a05Rows([]); }
      finally { setR4a05Loading(false); }
    }

    // R4A06 — Suppliers Aging Report
    async function loadR4a06Report(asOf: string, branch: string, account: string, slFrom: string, slTo: string, summaryOnly: boolean, unposted: boolean, posted: boolean) {
      if (!asOf) { setR4a06Error('Please select an As Of date.'); return; }
      const branchLabelText = subledgerBranches.find((b) => b.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setR4a06Loading(true); setR4a06Error(null);
      try {
        const params: Record<string, string> = { as_of: asOf, summary_only: String(summaryOnly), unposted: String(unposted), posted: String(posted) };
        if (branch) params.branch = branch;
        if (account !== 'all') params.at_code = account;
        if (slFrom !== 'all') params.sl_name_from = slFrom;
        if (slTo !== 'all') params.sl_name_to = slTo;
        const rows = await fetchSubledgerReport('suppliers-aging-report', params);
        setR4a06Rows(rows);
      } catch (err: any) { setR4a06Error(err?.message || 'Something went wrong.'); setR4a06Rows([]); }
      finally { setR4a06Loading(false); }
    }

    // --- FINANCIAL STATEMENTS REPORTS: shared loader.
    async function loadFinancialReport(code: string) {
      // FIX: this one shared loader covers all 11 Financial Statement
      // report codes — Trial Balance, Adjusted/Summary/Comparative
      // Balance Sheets, Income Statement variants, etc. None of them
      // called loadCompanyInfoIfNeeded or set the branch label, so
      // every one of them printed a literal "Company Name"/"Branch
      // Name" placeholder header instead of the real company/branch.
      // Fixing it here once fixes all 11.
      const branchLabelText =
        financialBranches.find((b) => b.value === selectedFinancialBranch)?.label || selectedFinancialBranch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(selectedFinancialBranch);
      setFinancialLoading(true);
      setFinancialError(null);
      try {
        const params: Record<string, string> = { branch: selectedFinancialBranch, view_as: selectedFinancialViewAs };
        if (isFinancialYearReport(code)) {
          if (!selectedFinancialYear) { setFinancialError('Please select a Financial Year.'); setFinancialLoading(false); return; }
          params.fy = selectedFinancialYear;
        } else {
          if (!selectedFinancialPeriodFrom || !selectedFinancialPeriodTo) { setFinancialError('Please select Period From and To.'); setFinancialLoading(false); return; }
          params.period_from = selectedFinancialPeriodFrom;
          params.period_to = selectedFinancialPeriodTo;
          if (code === TRIAL_BALANCE_CODE) params.year_to_date = String(financialYearToDate);
        }
        const endpointMap: Record<string, string> = {
          [TRIAL_BALANCE_CODE]: 'trial-balance',
          [ADJUSTED_BALANCE_SHEET_CODE]: 'adjusted-balance-sheet',
          [BALANCE_SHEET_LIST_CODE]: 'balance-sheet-list',
          [BALANCE_SUMMARY_SHEET_CODE]: 'balance-summary-sheet',
          [COMPARATIVE_BALANCE_SHEET_CODE]: 'comparative-balance-sheet',
          [COMPARATIVE_MONTHLY_BALANCE_SHEET_CODE]: 'comparative-monthly-balance-sheet',
          [INCOME_STATEMENT_LIST_CODE]: 'income-statement-list',
          [INCOME_STATEMENT_CODE]: 'income-statement',
          [COMPARATIVE_INCOME_STATEMENT_CODE]: 'comparative-income-statement',
          [COMPARATIVE_MONTHLY_INCOME_STATEMENT_CODE]: 'comparative-monthly-income-statement',
          [COMPARATIVE_MONTHLY_INCOME_STATEMENT_CC_CODE]: 'comparative-monthly-income-statement-per-cost-center',
        };
        const endpoint = endpointMap[code];
        if (!endpoint) throw new Error(`Unknown report code: ${code}`);
        const rows = await fetchFinancialReport(endpoint, params);
        setFinancialRows(rows);
      } catch (err: any) {
        setFinancialError(err?.message || 'Something went wrong.');
        setFinancialRows([]);
      } finally {
        setFinancialLoading(false);
      }
    }

    async function loadFinancialDropdownsThenReport(code: string) {
      setFinancialLoading(true);
      setFinancialError(null);
      setCurrentFinancialCode(code);
      try {
        const [b, p, y] = await Promise.all([fetchBranches(), fetchAccountingPeriods(), fetchFinancialYears()]);
        setFinancialBranches(b);
        setFinancialPeriods(p);
        setFinancialYears(y);
        const currentPeriod = getCurrentPeriodValue();
        if (isFinancialYearReport(code)) {
          const currentYear = new Date().getFullYear().toString();
          setSelectedFinancialYear(y.length > 0 ? y[0].value : currentYear);
        } else {
          setSelectedFinancialPeriodFrom(currentPeriod);
          setSelectedFinancialPeriodTo(currentPeriod);
        }
      } catch (err: any) {
        setFinancialError(err?.message || 'Failed to load dropdowns.');
      } finally {
        setFinancialLoading(false);
      }
    }

    // --- R3A01 REAL DATA: loaders — reuses MismatchPeriodFilterCard pattern.
    async function loadGeneralJournal(period: string, branch: string) {
      if (!period) { setR3a01Error('Please select a Period.'); return; }
      setR3a01Loading(true);
      setR3a01Error(null);
      try {
        const rows = await fetchGeneralJournal(period, branch || undefined);
        setR3a01Rows(rows);
      } catch (err: any) {
        setR3a01Error(err?.message || 'Something went wrong.');
        setR3a01Rows([]);
      } finally {
        setR3a01Loading(false);
      }
    }

    async function loadR3a01DropdownsThenReport(branch: string) {
      setR3a01Loading(true);
      setR3a01Error(null);
      try {
        const [b, p] = await Promise.all([fetchBranches(), fetchAccountingPeriods()]);
        setR3a01Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR3a01Periods(p);
        const currentPeriod = getCurrentPeriodValue();
        setSelectedR3a01Period(currentPeriod);
        await loadGeneralJournal(currentPeriod, validBranch);
      } catch (err: any) {
        setR3a01Error(err?.message || 'Failed to load dropdowns.');
        setR3a01Loading(false);
      }
    }

    async function handleR3a01BranchChange(branch: string) {
      const branchLabelText = r3a01Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR3a01Branch(branch);
      await loadGeneralJournal(selectedR3a01Period, branch);
    }
    
    // --- R2A03 REAL DATA: loaders.
    async function loadCheckByCheckNumber(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCodeFrom: string,
      atCodeTo: string,
      jDesc: string,
    ) {
      setR2a03Loading(true);
      setR2a03Error(null);
      try {
        const rows = await fetchCheckByCheckNumber(
          dateFrom, dateTo,
          branch || undefined,
          atCodeFrom !== 'all' ? atCodeFrom : undefined,
          atCodeTo !== 'all' ? atCodeTo : undefined,
          jDesc !== 'all' ? jDesc : undefined,
        );
        setR2a03Rows(rows);
      } catch (err: any) {
        setR2a03Error(err?.message || 'Something went wrong.');
        setR2a03Rows([]);
      } finally {
        setR2a03Loading(false);
      }
    }

    async function loadR2a03DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setR2a03Loading(true);
      setR2a03Error(null);
      try {
        const [b, a, j] = await Promise.all([
          fetchBranches(),
          fetchCIBAccounts(),
          fetchJournals(),
        ]);
        setR2a03Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR2a03Accounts(a);
        // Journal Books: dedupe by j_desc for the dropdown
        const seen = new Set<string>();
        const jBooks = j
          .filter((jj) => { if (seen.has(jj.label)) return false; seen.add(jj.label); return true; })
          .map((jj) => ({ value: jj.label, label: jj.label }));
        setR2a03JournalBooks(jBooks);
        await loadCheckByCheckNumber(dateFrom, dateTo, validBranch, 'all', 'all', 'all');
      } catch (err: any) {
        setR2a03Error(err?.message || 'Failed to load dropdowns.');
        setR2a03Loading(false);
      }
    }

    async function handleR2a03BranchChange(branch: string) {
      const branchLabelText = r2a03Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR2a03Branch(branch);
      const today = formatLocalDate(new Date());
      await loadCheckByCheckNumber(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedR2a03AccountFrom,
        selectedR2a03AccountTo,
        selectedR2a03JournalBook,
      );
    }

    // --- R2A02 REAL DATA: loaders — same pattern as R2A01.
    async function loadCheckByCheckDate(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCodeFrom: string,
      atCodeTo: string,
    ) {
      setR2a02Loading(true);
      setR2a02Error(null);
      try {
        const rows = await fetchCheckByCheckDate(
          dateFrom, dateTo,
          branch || undefined,
          atCodeFrom !== 'all' ? atCodeFrom : undefined,
          atCodeTo !== 'all' ? atCodeTo : undefined,
        );
        setR2a02Rows(rows);
      } catch (err: any) {
        setR2a02Error(err?.message || 'Something went wrong.');
        setR2a02Rows([]);
      } finally {
        setR2a02Loading(false);
      }
    }

    async function loadR2a02DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setR2a02Loading(true);
      setR2a02Error(null);
      try {
        const [b, a] = await Promise.all([fetchBranches(), fetchCIBAccounts()]);
        setR2a02Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR2a02Accounts(a);
        await loadCheckByCheckDate(dateFrom, dateTo, validBranch, 'all', 'all');
      } catch (err: any) {
        setR2a02Error(err?.message || 'Failed to load dropdowns.');
        setR2a02Loading(false);
      }
    }

    async function handleR2a02BranchChange(branch: string) {
      const branchLabelText = r2a02Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR2a02Branch(branch);
      const today = formatLocalDate(new Date());
      await loadCheckByCheckDate(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedR2a02AccountFrom,
        selectedR2a02AccountTo,
      );
    }

    // --- R2A01 REAL DATA: loaders.
    async function loadCheckByEntryDate(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCodeFrom: string,
      atCodeTo: string,
    ) {
      setR2a01Loading(true);
      setR2a01Error(null);
      try {
        const rows = await fetchCheckByEntryDate(
          dateFrom, dateTo,
          branch || undefined,
          atCodeFrom !== 'all' ? atCodeFrom : undefined,
          atCodeTo !== 'all' ? atCodeTo : undefined,
        );
        setR2a01Rows(rows);
      } catch (err: any) {
        setR2a01Error(err?.message || 'Something went wrong.');
        setR2a01Rows([]);
      } finally {
        setR2a01Loading(false);
      }
    }

    async function loadR2a01DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setR2a01Loading(true);
      setR2a01Error(null);
      try {
        const [b, a] = await Promise.all([fetchBranches(), fetchCIBAccounts()]);
        setR2a01Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setR2a01Accounts(a);
        await loadCheckByEntryDate(dateFrom, dateTo, validBranch, 'all', 'all');
      } catch (err: any) {
        setR2a01Error(err?.message || 'Failed to load dropdowns.');
        setR2a01Loading(false);
      }
    }

    async function handleR2a01BranchChange(branch: string) {
      const branchLabelText = r2a01Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedR2a01Branch(branch);
      const today = formatLocalDate(new Date());
      await loadCheckByEntryDate(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedR2a01AccountFrom,
        selectedR2a01AccountTo,
      );
    }

    // --- R1A085 REAL DATA: loaders — same pattern as R1A083.
    async function loadSubsidiaryDiffAccountLink(period: string, branch: string) {
      if (!period) {
        setA085Error('Please select an Accounting Period.');
        return;
      }
      setA085Loading(true);
      setA085Error(null);
      try {
        const rows = await fetchSubsidiaryDiffAccountLink(period, branch || undefined);
        setA085Rows(rows);
      } catch (err: any) {
        setA085Error(err?.message || 'Something went wrong.');
        setA085Rows([]);
      } finally {
        setA085Loading(false);
      }
    }

    async function loadA085DropdownsThenReport(branch: string) {
      setA085Loading(true);
      setA085Error(null);
      try {
        const [b, p] = await Promise.all([fetchBranches(), fetchAccountingPeriods()]);
        setA085Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA085Periods(p);
        const currentPeriod = getCurrentPeriodValue();
        setSelectedA085Period(currentPeriod);
        await loadSubsidiaryDiffAccountLink(currentPeriod, validBranch);
      } catch (err: any) {
        setA085Error(err?.message || 'Failed to load dropdowns.');
        setA085Loading(false);
      }
    }

    async function handleA085BranchChange(branch: string) {
      const branchLabelText = a085Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA085Branch(branch);
      await loadSubsidiaryDiffAccountLink(selectedA085Period, branch);
    }

    // --- R1A084 REAL DATA: loaders.
    async function loadWithoutAccountLinkReport(
      period: string,
      dateFrom: string,
      dateTo: string,
      branch: string,
    ) {
      if (!period) {
        setA084Error('Please select an Accounting Period.');
        return;
      }
      setA084Loading(true);
      setA084Error(null);
      try {
        const rows = await fetchWithoutAccountLinkReport(
          period, dateFrom, dateTo, branch || undefined,
        );
        setA084Rows(rows);
      } catch (err: any) {
        setA084Error(err?.message || 'Something went wrong.');
        setA084Rows([]);
      } finally {
        setA084Loading(false);
      }
    }

    async function loadA084DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setA084Loading(true);
      setA084Error(null);
      try {
        const [b, p] = await Promise.all([fetchBranches(), fetchAccountingPeriods()]);
        setA084Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA084Periods(p);
        const currentPeriod = getCurrentPeriodValue();
        setSelectedA084Period(currentPeriod);
        await loadWithoutAccountLinkReport(currentPeriod, dateFrom, dateTo, validBranch);
      } catch (err: any) {
        setA084Error(err?.message || 'Failed to load dropdowns.');
        setA084Loading(false);
      }
    }

    async function handleA084BranchChange(branch: string) {
      const branchLabelText = a084Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA084Branch(branch);
      const today = formatLocalDate(new Date());
      await loadWithoutAccountLinkReport(
        selectedA084Period,
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
      );
    }

    // --- R1A083 REAL DATA: loaders.
    async function loadMismatchAccountingPeriod(period: string, branch: string) {
      if (!period) {
        setA083Error('Please select an Accounting Period.');
        return;
      }
      setA083Loading(true);
      setA083Error(null);
      try {
        const rows = await fetchMismatchAccountingPeriod(period, branch || undefined);
        setA083Rows(rows);
      } catch (err: any) {
        setA083Error(err?.message || 'Something went wrong.');
        setA083Rows([]);
      } finally {
        setA083Loading(false);
      }
    }

    async function loadA083DropdownsThenReport(branch: string) {
      setA083Loading(true);
      setA083Error(null);
      try {
        const [b, p] = await Promise.all([fetchBranches(), fetchAccountingPeriods()]);
        setA083Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA083Periods(p);
        const currentPeriod = getCurrentPeriodValue();
        setSelectedA083Period(currentPeriod);
        await loadMismatchAccountingPeriod(currentPeriod, validBranch);
      } catch (err: any) {
        setA083Error(err?.message || 'Failed to load dropdowns.');
        setA083Loading(false);
      }
    }

    async function handleA083BranchChange(branch: string) {
      const branchLabelText = a083Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA083Branch(branch);
      await loadMismatchAccountingPeriod(selectedA083Period, branch);
    }

    // --- R1A082 REAL DATA: loaders — same pattern as R1A081.
    async function loadSubsidiaryWithoutSubsidiary(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCode: string,
    ) {
      setA082Loading(true);
      setA082Error(null);
      try {
        const rows = await fetchSubsidiaryWithoutSubsidiary(
          dateFrom, dateTo,
          branch || undefined,
          atCode !== 'all' ? atCode : undefined,
        );
        setA082Rows(rows);
      } catch (err: any) {
        setA082Error(err?.message || 'Something went wrong.');
        setA082Rows([]);
      } finally {
        setA082Loading(false);
      }
    }

    async function loadA082DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setA082Loading(true);
      setA082Error(null);
      try {
        const [b, a] = await Promise.all([fetchBranches(), fetchChartOfAccounts()]);
        setA082Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA082Accounts(a);
        await loadSubsidiaryWithoutSubsidiary(dateFrom, dateTo, validBranch, 'all');
      } catch (err: any) {
        setA082Error(err?.message || 'Failed to load dropdowns.');
        setA082Loading(false);
      }
    }

    async function handleA082BranchChange(branch: string) {
      const branchLabelText = a082Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA082Branch(branch);
      const today = formatLocalDate(new Date());
      await loadSubsidiaryWithoutSubsidiary(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch, selectedA082Account,
      );
    }

    async function handleA082AccountChange(atCode: string) {
      setSelectedA082Account(atCode);
      const today = formatLocalDate(new Date());
      await loadSubsidiaryWithoutSubsidiary(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA082Branch, atCode,
      );
    }

    // --- R1A081 REAL DATA: loaders.
    async function loadUnbalanceJournalList(
      dateFrom: string,
      dateTo: string,
      branch: string,
      atCode: string,
    ) {
      setA081Loading(true);
      setA081Error(null);
      try {
        const rows = await fetchUnbalanceJournalList(
          dateFrom,
          dateTo,
          branch || undefined,
          atCode !== 'all' ? atCode : undefined,
        );
        setA081Rows(rows);
      } catch (err: any) {
        setA081Error(err?.message || 'Something went wrong.');
        setA081Rows([]);
      } finally {
        setA081Loading(false);
      }
    }

    async function loadA081DropdownsThenReport(dateFrom: string, dateTo: string, branch: string) {
      setA081Loading(true);
      setA081Error(null);
      try {
        const [b, a] = await Promise.all([fetchBranches(), fetchChartOfAccounts()]);
        setA081Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA081Accounts(a);
        await loadUnbalanceJournalList(dateFrom, dateTo, validBranch, 'all');
      } catch (err: any) {
        setA081Error(err?.message || 'Failed to load dropdowns.');
        setA081Loading(false);
      }
    }

    async function handleA081BranchChange(branch: string) {
      const branchLabelText = a081Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA081Branch(branch);
      const today = formatLocalDate(new Date());
      await loadUnbalanceJournalList(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
        selectedA081Account,
      );
    }

    async function handleA081AccountChange(atCode: string) {
      setSelectedA081Account(atCode);
      const today = formatLocalDate(new Date());
      await loadUnbalanceJournalList(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA081Branch,
        atCode,
      );
    }

    // --- R1A07 REAL DATA: loaders — no branch needed.
    async function loadSummaryStatementOfAccounts(dateFrom: string, dateTo: string) {
      setA107Loading(true);
      setA107Error(null);
      try {
        const rows = await fetchSummaryStatementOfAccounts(dateFrom, dateTo);
        setA107Rows(rows);
      } catch (err: any) {
        setA107Error(err?.message || 'Something went wrong.');
        setA107Rows([]);
      } finally {
        setA107Loading(false);
      }
    }

    // --- R1A061 REAL DATA: loaders.
    async function loadSummaryOfOutputTax(dateFrom: string, dateTo: string, branch: string) {
      setA061Loading(true);
      setA061Error(null);
      try {
        const rows = await fetchSummaryOfOutputTax(dateFrom, dateTo, branch || undefined);
        setA061Rows(rows);
      } catch (err: any) {
        setA061Error(err?.message || 'Something went wrong.');
        setA061Rows([]);
      } finally {
        setA061Loading(false);
      }
    }

    async function loadA061BranchesThenReport(dateFrom: string, dateTo: string, branch: string) {
      setA061Loading(true);
      setA061Error(null);
      try {
        const b = await fetchBranches();
        setA061Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        await loadSummaryOfOutputTax(dateFrom, dateTo, validBranch);
      } catch (err: any) {
        setA061Error(err?.message || 'Failed to load branches.');
        setA061Loading(false);
      }
    }

    async function handleA061BranchChange(branch: string) {
      const branchLabelText = a061Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA061Branch(branch);
      const today = formatLocalDate(new Date());
      await loadSummaryOfOutputTax(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
      );
    }

    // --- R1A06 REAL DATA: loaders.
    async function loadSummaryOfInputTax(dateFrom: string, dateTo: string, branch: string) {
      setA106Loading(true);
      setA106Error(null);
      try {
        const rows = await fetchSummaryOfInputTax(dateFrom, dateTo, branch || undefined);
        setA106Rows(rows);
      } catch (err: any) {
        setA106Error(err?.message || 'Something went wrong.');
        setA106Rows([]);
      } finally {
        setA106Loading(false);
      }
    }

    async function loadA106BranchesThenReport(dateFrom: string, dateTo: string, branch: string) {
      setA106Loading(true);
      setA106Error(null);
      try {
        const b = await fetchBranches();
        setA106Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        await loadSummaryOfInputTax(dateFrom, dateTo, validBranch);
      } catch (err: any) {
        setA106Error(err?.message || 'Failed to load branches.');
        setA106Loading(false);
      }
    }

    async function handleA106BranchChange(branch: string) {
      const branchLabelText = a106Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA106Branch(branch);
      const today = formatLocalDate(new Date());
      await loadSummaryOfInputTax(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        branch,
      );
    }

    // --- R1A05 REAL DATA: loaders.
    async function loadAccountMovementSummary(filters: JournalFilters, branch: string) {
      setA105Loading(true);
      setA105Error(null);
      try {
        const rows = await fetchAccountMovementSummary(filters, branch || undefined);
        setA105Rows(rows);
      } catch (err: any) {
        setA105Error(err?.message || 'Something went wrong.');
        setA105Rows([]);
      } finally {
        setA105Loading(false);
      }
    }

    async function loadA105BranchesAndJournalsThenReport(filters: JournalFilters, branch: string) {
      setA105Loading(true);
      setA105Error(null);
      try {
        const [b, j] = await Promise.all([fetchBranches(), fetchJournals()]);
        setA105Branches(b);

        const validBranch = b.some((br) => br.value === branch) ? branch : (b[0]?.value || '');
        const branchLabelText = b.find((br) => br.value === validBranch)?.label || validBranch;
        setActiveBranchLabel(branchLabelText);
        void loadCompanyInfoIfNeeded(validBranch);
        setA105Journals(j);
        await loadAccountMovementSummary(filters, validBranch);
      } catch (err: any) {
        setA105Error(err?.message || 'Failed to load branches/journals.');
        setA105Loading(false);
      }
    }

    async function handleA105BranchChange(branch: string) {
      const branchLabelText = a105Branches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedA105Branch(branch);
      await loadAccountMovementSummary(journalFilters, branch);
    }

    // --- R1A03 REAL DATA: shared loader for the report rows. Account ID is
    // required — the backend 400s without one, so we short-circuit here
    // with a friendly message instead of firing a doomed request.
    async function loadCashPosition(
      filters: JournalFilters,
      branch: string,
      accountId: string,
      fy: string,
      includePrevious: boolean,
    ) {
      if (!accountId) {
        setCashPositionError('Please select an Account ID.');
        return;
      }
      setCashPositionLoading(true);
      setCashPositionError(null);
      try {
        const rows = await fetchCashPositionCIB(filters, branch, accountId, fy, includePrevious);
        setCashPositionRows(rows);
      } catch (err: any) {
        setCashPositionError(err?.message || 'Something went wrong.');
        setCashPositionRows([]);
      } finally {
        setCashPositionLoading(false);
      }
    }

    // --- R1A03 REAL DATA: populates Account ID (reuses chart-of-accounts,
    // same source as R1A01) and Financial Year (deduped from accounting-
    // periods, same source as R1A02) dropdowns. No auto-fetch of the report
    // itself — Account ID is required and starts unselected.
    async function loadCashPositionDropdowns() {
      setCashPositionLoading(true);
      setCashPositionError(null);
      try {
        const [accounts, periodsList, branches] = await Promise.all([
          fetchCIBAccounts(),
          fetchAccountingPeriods(),
          fetchBranches(),
        ]);
        setCashPositionAccounts(accounts);
        // Auto-select if only one CIB account — prevents Preview staying
        // disabled when the user can't tell they need to "select" something
        // that's already the only option.
        if (accounts.length === 1) {
          setSelectedCashPositionAccount(accounts[0].value);
        }
        const years = Array.from(new Set(periodsList.map((p) => p.fy))).sort((a, b) => b - a);
        setCashPositionFyOptions(years);
        setCashPositionBranches(branches);
      } catch (err: any) {
        setCashPositionError(err?.message || 'Failed to load accounts/years/branches.');
      } finally {
        setCashPositionLoading(false);
      }
    }

    async function handleCashPositionAccountChange(accountId: string) {
      setSelectedCashPositionAccount(accountId);
      await loadCashPosition(
        journalFilters,
        selectedCashPositionBranch,
        accountId,
        selectedCashPositionFy,
        includePreviousCashPosition,
      );
    }

    async function handleCashPositionBranchChange(branch: string) {
      const branchLabelText = cashPositionBranches.find((br) => br.value === branch)?.label || branch;
      setActiveBranchLabel(branchLabelText);
      void loadCompanyInfoIfNeeded(branch);
      setSelectedCashPositionBranch(branch);
      if (selectedCashPositionAccount) {
        await loadCashPosition(
          journalFilters,
          branch,
          selectedCashPositionAccount,
          selectedCashPositionFy,
          includePreviousCashPosition,
        );
      }
    }

    function handleReportSelect(code: string) {
      setReportCode(code);

      // --- R1A01 REAL DATA: dates default to today, auto-loads immediately.
      if (code === ACCOUNT_ACTIVITY_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setAccountActivityRows([]);
        setAccountActivityError(null);
        // --- R1A01 REAL DATA (branch fix): real branch list fetched here too.
        void loadAccountActivityBranchesThenReport(initialFilters, selectedAccountActivityBranch);
      } else if (code === LIST_UNPOSTED_REPORT_CODE) {
        // --- R1A02 REAL DATA: period defaults to the current fiscal month,
        // auto-loads immediately (may well be empty if this period has no
        // data yet — that's expected, not a bug, same as A101).
        const currentPeriod = getCurrentPeriodValue();
        setSelectedJournal('');
        setSelectedPeriodFrom(currentPeriod);
        setSelectedPeriodTo(currentPeriod);
        setUnpostedRows([]);
        setUnpostedError(null);
        void loadPeriodsAndJournalsThenReport(currentPeriod, selectedUnpostedBranch);
      } else if (code === GL_ACTIVITY_BY_ACCOUNT_ID_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR3a02Rows([]);
        setR3a02Error(null);
        setSelectedR3a02AccountFrom('all');
        setSelectedR3a02AccountTo('all');
        setSelectedR3a02Journal('all');
        void loadR3a02DropdownsThenReport(today, today, selectedR3a02Branch);
      } else if (code === GENERAL_JOURNAL_REPORT_CODE) {
        setR3a01Rows([]);
        setR3a01Error(null);
        void loadR3a01DropdownsThenReport(selectedR3a01Branch);
      } else if (code === CHECK_BY_CHECK_NUMBER_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR2a03Rows([]);
        setR2a03Error(null);
        setSelectedR2a03AccountFrom('all');
        setSelectedR2a03AccountTo('all');
        setSelectedR2a03JournalBook('all');
        void loadR2a03DropdownsThenReport(today, today, selectedR2a03Branch);
      } else if (code === CHECK_BY_CHECK_DATE_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR2a02Rows([]);
        setR2a02Error(null);
        setSelectedR2a02AccountFrom('all');
        setSelectedR2a02AccountTo('all');
        void loadR2a02DropdownsThenReport(today, today, selectedR2a02Branch);
      } else if (code === CHECK_BY_ENTRY_DATE_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR2a01Rows([]);
        setR2a01Error(null);
        setSelectedR2a01AccountFrom('all');
        setSelectedR2a01AccountTo('all');
        void loadR2a01DropdownsThenReport(today, today, selectedR2a01Branch);
      } else if (code === SUBSIDIARY_DIFF_ACCOUNT_LINK_REPORT_CODE) {
        setA085Rows([]);
        setA085Error(null);
        void loadA085DropdownsThenReport(selectedA085Branch);
      } else if (code === WITHOUT_ACCOUNT_LINK_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setA084Rows([]);
        setA084Error(null);
        void loadA084DropdownsThenReport(today, today, selectedA084Branch);
      } else if (code === MISMATCH_ACCOUNTING_PERIOD_REPORT_CODE) {
        setA083Rows([]);
        setA083Error(null);
        void loadA083DropdownsThenReport(selectedA083Branch);
      } else if (code === SUBSIDIARY_WITHOUT_SUBSIDIARY_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setA082Rows([]);
        setA082Error(null);
        setSelectedA082Account('all');
        void loadA082DropdownsThenReport(today, today, selectedA082Branch);
      } else if (code === UNBALANCE_JOURNAL_LIST_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setA081Rows([]);
        setA081Error(null);
        setSelectedA081Account('all');
        void loadA081DropdownsThenReport(today, today, selectedA081Branch);
      } else if (code === SUMMARY_STATEMENT_ACCOUNTS_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setA107Rows([]);
        setA107Error(null);
        void loadSummaryStatementOfAccounts(today, today);
      } else if (code === SUMMARY_OUTPUT_TAX_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setA061Rows([]);
        setA061Error(null);
        void loadA061BranchesThenReport(today, today, selectedA061Branch);
      } else if (code === SUMMARY_INPUT_TAX_REPORT_CODE) {
        // --- R1A06 REAL DATA: dates default to today, auto-loads immediately.
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setA106Rows([]);
        setA106Error(null);
        void loadA106BranchesThenReport(today, today, selectedA106Branch);
      } else if (code === ACCOUNT_MOVEMENT_SUMMARY_REPORT_CODE) {
        // --- R1A05 REAL DATA: dates default to today, auto-loads immediately.
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setA105Rows([]);
        setA105Error(null);
        void loadA105BranchesAndJournalsThenReport(initialFilters, selectedA105Branch);
      } else if (code === UNPOSTED_ENTRIES_A104_REPORT_CODE) {
        // --- R1A04 REAL DATA: same auto-load pattern as R1A02.
        const currentPeriod = getCurrentPeriodValue();
        setSelectedA104Journal('');
        setSelectedA104PeriodFrom(currentPeriod);
        setSelectedA104PeriodTo(currentPeriod);
        setA104Rows([]);
        setA104Error(null);
        void loadA104PeriodsAndJournalsThenReport(currentPeriod, selectedA104Branch);
      } else if (code === CASH_POSITION_REPORT_CODE) {
        // --- R1A03 REAL DATA: dates default to today; no auto-fetch of the
        // report itself since Account ID is required and starts unselected —
        // only the dropdowns load automatically.
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = {
          ...DEFAULT_JOURNAL_FILTERS,
          dateFrom: today,
          dateTo: today,
        };
        setJournalFilters(initialFilters);
        setCashPositionRows([]);
        setCashPositionError(null);
        setSelectedCashPositionAccount('');
        setSelectedCashPositionFy('all');
        setIncludePreviousCashPosition(false);
        void loadCashPositionDropdowns();
      } else if (code === GL_BY_JOURNAL_ID_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR3a03Rows([]);
        setR3a03Error(null);
        setSelectedR3a03JournalFrom('');
        setSelectedR3a03JournalTo('');
        void loadR3a03DropdownsThenReport(initialFilters, selectedR3a03Branch);
      } else if (code === GL_SUMMARY_BY_ACCOUNT_ID_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        const initialFilters: JournalFilters = { ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today };
        setJournalFilters(initialFilters);
        setR3a04Rows([]);
        setR3a04Error(null);
        setSelectedR3a04AccountFrom('all');
        setSelectedR3a04AccountTo('all');
        setSelectedR3a04Journal('all');
        void loadR3a04DropdownsThenReport(today, today, selectedR3a04Branch);
      } else if (code === BALANCES_FROM_CUSTOMER_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        setR4a02AsOf(today); setR4a02Rows([]); setR4a02Error(null);
        setSelectedR4a02Account('all'); setSelectedR4a02SlFrom('all'); setSelectedR4a02SlTo('all');
        void loadSubledgerDropdowns();
      } else if (code === CUSTOMERS_AGING_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        setR4a03AsOf(today); setR4a03Rows([]); setR4a03Error(null);
        setSelectedR4a03Account('all'); setSelectedR4a03SlFrom('all'); setSelectedR4a03SlTo('all');
        setR4a03SummaryOnly(false);
        void loadSubledgerDropdowns();
      } else if (code === BALANCES_TO_SUPPLIER_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        setR4a05AsOf(today); setR4a05Rows([]); setR4a05Error(null);
        setSelectedR4a05Account('all'); setSelectedR4a05SlFrom('all'); setSelectedR4a05SlTo('all');
        void loadSubledgerDropdowns();
      } else if (code === SUPPLIERS_AGING_REPORT_CODE) {
        const today = formatLocalDate(new Date());
        setR4a06AsOf(today); setR4a06Rows([]); setR4a06Error(null);
        setSelectedR4a06Account('all'); setSelectedR4a06SlFrom('all'); setSelectedR4a06SlTo('all');
        setR4a06SummaryOnly(false);
        void loadSubledgerDropdowns();
      } else if (isFinancialStatementReportCode(code)) {
        // All 11 financial statement reports share one state + loader
        setFinancialRows([]);
        setFinancialError(null);
        setFinancialYearToDate(false);
        setFinancialCompareBudget(false);
        setSelectedFinancialViewAs('posted');
        void loadFinancialDropdownsThenReport(code);
      } else if (isSalesReport(code)) {
        // --- SALES REAL DATA: reset on open. No auto-load — Branch is
        // required and starts unselected, same pattern as R1A03.
        setSalesRows([]);
        setSalesError(null);
      } else if (isInventoryReport(code)) {
        // --- INVENTORY REAL DATA: reset on open, same pattern as Sales.
        setInventoryRows([]);
        setInventoryError(null);
      } else {
        setJournalFilters(DEFAULT_JOURNAL_FILTERS);
        setJournalEntries([]);
        setJournalError(null);
      }
    }

    function handleBackToReportList() {
      setReportCode(null);
      setJournalEntries([]);
      setJournalError(null);
      setAccountActivityRows([]);
      setAccountActivityError(null);
      setJournalFilters(DEFAULT_JOURNAL_FILTERS);
      // --- R1A02 REAL DATA: reset on back navigation too.
      setUnpostedRows([]);
      setUnpostedError(null);
      setSelectedJournal('');
      setSelectedPeriodFrom('');
      setSelectedPeriodTo('');
      // --- R3A02 REAL DATA: reset on back navigation too.
      setR3a02Rows([]);
      setR3a02Error(null);
      setSelectedR3a02AccountFrom('all');
      setSelectedR3a02AccountTo('all');
      setSelectedR3a02Journal('all');
      // --- R3A03 REAL DATA: reset on back navigation too.
      setR3a03Rows([]);
      setR3a03Error(null);
      setSelectedR3a03JournalFrom('');
      setSelectedR3a03JournalTo('');
      // --- R3A04 REAL DATA: reset on back navigation too.
      setR3a04Rows([]);
      setR3a04Error(null);
      setSelectedR3a04AccountFrom('all');
      setSelectedR3a04AccountTo('all');
      setSelectedR3a04Journal('all');
      // --- SUBLEDGER REPORTS: reset on back navigation too.
      setR4a02Rows([]); setR4a02Error(null);
      setR4a03Rows([]); setR4a03Error(null);
      setR4a05Rows([]); setR4a05Error(null);
      setR4a06Rows([]); setR4a06Error(null);
      // --- FINANCIAL STATEMENTS: reset on back navigation too.
      setFinancialRows([]); setFinancialError(null); setCurrentFinancialCode(null);
      // --- R3A01 REAL DATA: reset on back navigation too.
      setR3a01Rows([]);
      setR3a01Error(null);
      setSelectedR3a01Period('');
      // --- R2A03 REAL DATA: reset on back navigation too.
      setR2a03Rows([]);
      setR2a03Error(null);
      setSelectedR2a03AccountFrom('all');
      setSelectedR2a03AccountTo('all');
      setSelectedR2a03JournalBook('all');
      // --- R2A02 REAL DATA: reset on back navigation too.
      setR2a02Rows([]);
      setR2a02Error(null);
      setSelectedR2a02AccountFrom('all');
      setSelectedR2a02AccountTo('all');
      // --- R2A01 REAL DATA: reset on back navigation too.
      setR2a01Rows([]);
      setR2a01Error(null);
      setSelectedR2a01AccountFrom('all');
      setSelectedR2a01AccountTo('all');
      // --- R1A085 REAL DATA: reset on back navigation too.
      setA085Rows([]);
      setA085Error(null);
      setSelectedA085Period('');
      // --- R1A084 REAL DATA: reset on back navigation too.
      setA084Rows([]);
      setA084Error(null);
      setSelectedA084Period('');
      // --- R1A083 REAL DATA: reset on back navigation too.
      setA083Rows([]);
      setA083Error(null);
      setSelectedA083Period('');
      // --- R1A082 REAL DATA: reset on back navigation too.
      setA082Rows([]);
      setA082Error(null);
      setSelectedA082Account('all');
      // --- R1A081 REAL DATA: reset on back navigation too.
      setA081Rows([]);
      setA081Error(null);
      setSelectedA081Account('all');
      // --- R1A07 REAL DATA: reset on back navigation too.
      setA107Rows([]);
      setA107Error(null);
      // --- R1A061 REAL DATA: reset on back navigation too.
      setA061Rows([]);
      setA061Error(null);
      // --- R1A06 REAL DATA: reset on back navigation too.
      setA106Rows([]);
      setA106Error(null);
      // --- R1A05 REAL DATA: reset on back navigation too.
      setA105Rows([]);
      setA105Error(null);
      // --- R1A04 REAL DATA: reset on back navigation too.
      setA104Rows([]);
      setA104Error(null);
      setSelectedA104Journal('');
      setSelectedA104PeriodFrom('');
      setSelectedA104PeriodTo('');
      // --- R1A03 REAL DATA: reset on back navigation too.
      setCashPositionRows([]);
      setCashPositionError(null);
      setSelectedCashPositionAccount('');
      setSelectedCashPositionFy('all');
      setIncludePreviousCashPosition(false);
      // --- SALES REAL DATA: reset on back navigation too.
      setSalesRows([]);
      setSalesError(null);
      // --- INVENTORY REAL DATA: reset on back navigation too.
      setInventoryRows([]);
      setInventoryError(null);
    }

    // --- R1A02 REAL DATA: Preview / Clear handlers.
    async function handlePreviewUnpostedEntries() {
      if (!selectedPeriodFrom || !selectedPeriodTo) {
        setUnpostedError('Please select both Period From and Period To.');
        return;
      }
      await loadUnpostedEntries(selectedPeriodFrom, selectedPeriodTo, selectedJournal, selectedUnpostedBranch);
    }

    function handleClearUnpostedFilters() {
      const currentPeriod = getCurrentPeriodValue();
      setSelectedJournal('');
      setSelectedPeriodFrom(currentPeriod);
      setSelectedPeriodTo(currentPeriod);
      setUnpostedRows([]);
      setUnpostedError(null);
    }

    async function handlePreviewJournalEntries() {
      setJournalLoading(true);
      setJournalError(null);
      try {
        const rows = await fetchJournalEntries(journalFilters);
        setJournalEntries(rows);
      } catch (err: any) {
        setJournalError(err?.message || 'Something went wrong.');
        setJournalEntries([]);
      } finally {
        setJournalLoading(false);
      }
    }

    function handleClearJournalFilters() {
      setJournalFilters(DEFAULT_JOURNAL_FILTERS);
      setJournalEntries([]);
      setJournalError(null);
    }

    // --- R1A01 REAL DATA: Preview / Clear handlers, mirroring the journal
    // ones above but keeping dates defaulted to today on clear (rather than
    // blank, matching "don't have to put something in it").
    async function handlePreviewAccountActivity() {
      await loadAccountActivity(journalFilters, selectedAccountActivityBranch, selectedAccountActivityAccount);
    }

    function handleClearAccountActivityFilters() {
      const today = formatLocalDate(new Date());
      const cleared: JournalFilters = {
        ...DEFAULT_JOURNAL_FILTERS,
        dateFrom: today,
        dateTo: today,
      };
      setJournalFilters(cleared);
      setSelectedAccountActivityAccount('');
      setAccountActivityRows([]);
      setAccountActivityError(null);
    }

    // --- R3A02 REAL DATA: Preview / Clear handlers.
    async function handlePreviewR3a02() {
      const today = formatLocalDate(new Date());
      await loadGLActivityByAccountID(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedR3a02Branch,
        selectedR3a02AccountFrom,
        selectedR3a02Journal,
      );
    }

    function handleClearR3a02Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR3a02AccountFrom('all');
      setSelectedR3a02AccountTo('all');
      setSelectedR3a02Journal('all');
      setR3a02Rows([]);
      setR3a02Error(null);
    }

    // --- R3A01 REAL DATA: Preview / Clear handlers.
    async function handlePreviewR3a01() {
      await loadGeneralJournal(selectedR3a01Period, selectedR3a01Branch);
    }

    function handleClearR3a01Filters() {
      const currentPeriod = getCurrentPeriodValue();
      setSelectedR3a01Period(currentPeriod);
      setR3a01Rows([]);
      setR3a01Error(null);
    }

    // --- R2A03 REAL DATA: Preview / Clear handlers.
    async function handlePreviewR2a03() {
      const today = formatLocalDate(new Date());
      await loadCheckByCheckNumber(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedR2a03Branch,
        selectedR2a03AccountFrom,
        selectedR2a03AccountTo,
        selectedR2a03JournalBook,
      );
    }

    function handleClearR2a03Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR2a03AccountFrom('all');
      setSelectedR2a03AccountTo('all');
      setSelectedR2a03JournalBook('all');
      setR2a03Rows([]);
      setR2a03Error(null);
    }

    // --- R2A02 REAL DATA: Preview / Clear handlers.
    async function handlePreviewR2a02() {
      const today = formatLocalDate(new Date());
      await loadCheckByCheckDate(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedR2a02Branch,
        selectedR2a02AccountFrom,
        selectedR2a02AccountTo,
      );
    }

    function handleClearR2a02Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR2a02AccountFrom('all');
      setSelectedR2a02AccountTo('all');
      setR2a02Rows([]);
      setR2a02Error(null);
    }

    // --- R2A01 REAL DATA: Preview / Clear handlers.
    async function handlePreviewR2a01() {
      const today = formatLocalDate(new Date());
      await loadCheckByEntryDate(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedR2a01Branch,
        selectedR2a01AccountFrom,
        selectedR2a01AccountTo,
      );
    }

    function handleClearR2a01Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedR2a01AccountFrom('all');
      setSelectedR2a01AccountTo('all');
      setR2a01Rows([]);
      setR2a01Error(null);
    }

    // --- R1A085 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA085() {
      await loadSubsidiaryDiffAccountLink(selectedA085Period, selectedA085Branch);
    }

    function handleClearA085Filters() {
      const currentPeriod = getCurrentPeriodValue();
      setSelectedA085Period(currentPeriod);
      setA085Rows([]);
      setA085Error(null);
    }

    // --- R1A084 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA084() {
      const today = formatLocalDate(new Date());
      await loadWithoutAccountLinkReport(
        selectedA084Period,
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA084Branch,
      );
    }

    function handleClearA084Filters() {
      const today = formatLocalDate(new Date());
      const currentPeriod = getCurrentPeriodValue();
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedA084Period(currentPeriod);
      setA084Rows([]);
      setA084Error(null);
    }

    // --- R1A083 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA083() {
      await loadMismatchAccountingPeriod(selectedA083Period, selectedA083Branch);
    }

    function handleClearA083Filters() {
      const currentPeriod = getCurrentPeriodValue();
      setSelectedA083Period(currentPeriod);
      setA083Rows([]);
      setA083Error(null);
    }

    // --- R1A082 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA082() {
      const today = formatLocalDate(new Date());
      await loadSubsidiaryWithoutSubsidiary(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA082Branch, selectedA082Account,
      );
    }

    function handleClearA082Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedA082Account('all');
      setA082Rows([]);
      setA082Error(null);
    }

    // --- R1A081 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA081() {
      const today = formatLocalDate(new Date());
      await loadUnbalanceJournalList(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA081Branch,
        selectedA081Account,
      );
    }

    function handleClearA081Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedA081Account('all');
      setA081Rows([]);
      setA081Error(null);
    }

    // --- R1A07 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA107() {
      const today = formatLocalDate(new Date());
      await loadSummaryStatementOfAccounts(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
      );
    }

    function handleClearA107Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setA107Rows([]);
      setA107Error(null);
    }

    // --- R1A061 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA061() {
      const today = formatLocalDate(new Date());
      await loadSummaryOfOutputTax(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA061Branch,
      );
    }

    function handleClearA061Filters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setA061Rows([]);
      setA061Error(null);
    }

    // --- R1A06 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA106() {
      const today = formatLocalDate(new Date());
      await loadSummaryOfInputTax(
        journalFilters.dateFrom || today,
        journalFilters.dateTo || today,
        selectedA106Branch,
      );
    }

    function handleClearA106Filters() {
      const today = formatLocalDate(new Date());
      const cleared: JournalFilters = {
        ...DEFAULT_JOURNAL_FILTERS,
        dateFrom: today,
        dateTo: today,
      };
      setJournalFilters(cleared);
      setA106Rows([]);
      setA106Error(null);
    }

    // --- R1A05 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA105() {
      await loadAccountMovementSummary(journalFilters, selectedA105Branch);
    }

    function handleClearA105Filters() {
      const today = formatLocalDate(new Date());
      const cleared: JournalFilters = {
        ...DEFAULT_JOURNAL_FILTERS,
        dateFrom: today,
        dateTo: today,
      };
      setJournalFilters(cleared);
      setA105Rows([]);
      setA105Error(null);
    }

    // --- R1A04 REAL DATA: Preview / Clear handlers.
    async function handlePreviewA104() {
      if (!selectedA104PeriodFrom || !selectedA104PeriodTo) {
        setA104Error('Please select both Period From and Period To.');
        return;
      }
      await loadA104Entries(selectedA104PeriodFrom, selectedA104PeriodTo, selectedA104Journal, selectedA104Branch);
    }

    function handleClearA104Filters() {
      const currentPeriod = getCurrentPeriodValue();
      setSelectedA104Journal('');
      setSelectedA104PeriodFrom(currentPeriod);
      setSelectedA104PeriodTo(currentPeriod);
      setA104Rows([]);
      setA104Error(null);
    }

    // --- R1A03 REAL DATA: Preview / Clear handlers.
    async function handlePreviewCashPosition() {
      await loadCashPosition(
        journalFilters,
        selectedCashPositionBranch,
        selectedCashPositionAccount,
        selectedCashPositionFy,
        includePreviousCashPosition,
      );
    }

    function handleClearCashPositionFilters() {
      const today = formatLocalDate(new Date());
      setJournalFilters({ ...DEFAULT_JOURNAL_FILTERS, dateFrom: today, dateTo: today });
      setSelectedCashPositionAccount('');
      setSelectedCashPositionFy('all');
      setIncludePreviousCashPosition(false);
      setCashPositionRows([]);
      setCashPositionError(null);
    }

    // Shared clickable breadcrumb -- used on both the browse screen and the
    // report preview screen, so navigation is consistent everywhere instead
    // of the preview screen only having a plain "Back" button.
    function renderBreadcrumb() {
      return (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => {
              setSubKey(null);
              setReportCode(null);
            }}
            className={`transition hover:text-[#ea580c] ${
              !subCategory && !selectedReport
                ? 'font-medium text-[#ea580c]'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            Reports
          </button>

          {group && (
            <>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <button
                type="button"
                onClick={() => {
                  setSubKey(null);
                  setReportCode(null);
                }}
                className={`transition hover:text-[#ea580c] ${
                  subCategory || selectedReport
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'font-medium text-slate-700 dark:text-slate-200'
                }`}
              >
                {group.label}
              </button>
            </>
          )}

          {subCategory && (
            <>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <button
                type="button"
                onClick={() => setReportCode(null)}
                className={`transition hover:text-[#ea580c] ${
                  selectedReport
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'font-medium text-slate-700 dark:text-slate-200'
                }`}
              >
                {subCategory.label}
              </button>
            </>
          )}

          {selectedReport && (
            <>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {selectedReport.name}
              </span>
            </>
          )}
        </div>
      );
    }

    function handlePrintPreview() {
      iframeRef.current?.contentWindow?.focus();
      iframeRef.current?.contentWindow?.print();
    }

    function handleExportExcel() {
      if (!selectedReport || !group) return;

      // --- R1A01 REAL DATA: export the real fetched rows instead of the
      // generic {Report, Section} placeholder, when available.
      let rows: Record<string, any>[];
      if (isAccountActivityReportCode(selectedReport.code)) {
        rows =
          accountActivityRows.length > 0
            ? accountActivityRows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isListUnpostedReportCode(selectedReport.code)) {
        // --- R1A02 REAL DATA: export the real fetched rows.
        rows =
          unpostedRows.length > 0
            ? unpostedRows.map((r) => ({
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                Date: r.t_date,
                Payee: r.payee,
                Description: r.t_desc,
                'Check No.': r.ck_num,
                'Check Date': r.ck_date,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                'Subsidiary Name': r.sl_name,
                Debit: r.debit,
                Credit: r.credit,
                Invoice: r.invoice,
                'Cost Center': r.cc_code,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isCashPositionReportCode(selectedReport.code)) {
        // --- R1A03 REAL DATA: export the real fetched rows.
        rows =
          cashPositionRows.length > 0
            ? cashPositionRows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isGLActivityByAccountIDReportCode(selectedReport.code)) {
        rows =
          r3a02Rows.length > 0
            ? r3a02Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isGLByJournalIDReportCode(selectedReport.code)) {
        rows =
          r3a03Rows.length > 0
            ? r3a03Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isGLSummaryByAccountIDReportCode(selectedReport.code)) {
        rows =
          r3a04Rows.length > 0
            ? r3a04Rows.map((r) => ({
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                'Total Debit': r.total_debit,
                'Total Credit': r.total_credit,
                'Net Balance': r.net_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isBalancesFromCustomerReportCode(selectedReport.code)) {
        rows = r4a02Rows.length > 0
          ? r4a02Rows.map((r) => ({ Date: r.date, Reference: r.reference, Description: r.description, Subsidiary: (r as any).subsidiary, Debit: r.debit, Credit: r.credit, 'Running Bal.': r.running_balance }))
          : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isCustomersAgingReportCode(selectedReport.code)) {
        rows = r4a03Rows.length > 0
          ? r4a03Rows.map((r) => ({ Date: r.date, Reference: r.reference, Description: r.description, Subsidiary: (r as any).subsidiary, Debit: r.debit, Credit: r.credit, 'Running Bal.': r.running_balance }))
          : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isBalancesToSupplierReportCode(selectedReport.code)) {
        rows = r4a05Rows.length > 0
          ? r4a05Rows.map((r) => ({ Date: r.date, Reference: r.reference, Description: r.description, Subsidiary: (r as any).subsidiary, Debit: r.debit, Credit: r.credit, 'Running Bal.': r.running_balance }))
          : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSuppliersAgingReportCode(selectedReport.code)) {
        rows = r4a06Rows.length > 0
          ? r4a06Rows.map((r) => ({ Date: r.date, Reference: r.reference, Description: r.description, Subsidiary: (r as any).subsidiary, Debit: r.debit, Credit: r.credit, 'Running Bal.': r.running_balance }))
          : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isFinancialStatementReportCode(selectedReport.code)) {
        rows = financialRows.length > 0
          ? financialRows.map((r) => ({
              Section: r.section ?? '',
              'Account Code': r.at_code,
              'Account Name': r.at_desc,
              'Beg. Balance': r.bal_begin,
              Debit: r.debit,
              Credit: r.credit,
              'End Balance': r.bal_end,
              ...(r.cc_code ? { 'Cost Center': r.cc_code } : {}),
            }))
          : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isGeneralJournalReportCode(selectedReport.code)) {
        rows =
          r3a01Rows.length > 0
            ? r3a01Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isCheckByCheckNumberReportCode(selectedReport.code)) {
        rows =
          r2a03Rows.length > 0
            ? r2a03Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Check No.': r.ck_num,
                'Check Date': r.ck_date,
                Payee: r.payee,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isCheckByCheckDateReportCode(selectedReport.code)) {
        rows =
          r2a02Rows.length > 0
            ? r2a02Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Check No.': r.ck_num,
                'Check Date': r.ck_date,
                Payee: r.payee,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isCheckByEntryDateReportCode(selectedReport.code)) {
        rows =
          r2a01Rows.length > 0
            ? r2a01Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Check No.': r.ck_num,
                'Check Date': r.ck_date,
                Payee: r.payee,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSubsidiaryDiffAccountLinkReportCode(selectedReport.code)) {
        rows =
          a085Rows.length > 0
            ? a085Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Description: r.description,
                Remarks: r.remarks,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isWithoutAccountLinkReportCode(selectedReport.code)) {
        rows =
          a084Rows.length > 0
            ? a084Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Description: r.description,
                Remarks: r.remarks,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isMismatchAccountingPeriodReportCode(selectedReport.code)) {
        rows =
          a083Rows.length > 0
            ? a083Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Description: r.description,
                Remarks: r.remarks,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSubsidiaryWithoutSubsidiaryReportCode(selectedReport.code)) {
        rows =
          a082Rows.length > 0
            ? a082Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Description: r.description,
                Remarks: r.remarks,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isUnbalanceJournalListReportCode(selectedReport.code)) {
        rows =
          a081Rows.length > 0
            ? a081Rows.map((r) => ({
                Date: r.date,
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                Description: r.description,
                Remarks: r.remarks,
                Debit: r.debit,
                Credit: r.credit,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSummaryStatementAccountsReportCode(selectedReport.code)) {
        rows =
          a107Rows.length > 0
            ? a107Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSummaryOutputTaxReportCode(selectedReport.code)) {
        rows =
          a061Rows.length > 0
            ? a061Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isSummaryInputTaxReportCode(selectedReport.code)) {
        // --- R1A06 REAL DATA: export real fetched rows.
        rows =
          a106Rows.length > 0
            ? a106Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isAccountMovementSummaryReportCode(selectedReport.code)) {
        // --- R1A05 REAL DATA: export real fetched rows.
        rows =
          a105Rows.length > 0
            ? a105Rows.map((r) => ({
                Date: r.date,
                Reference: r.reference,
                Description: r.description,
                Debit: r.debit,
                Credit: r.credit,
                'Running Bal.': r.running_balance,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else if (isUnpostedEntriesA104ReportCode(selectedReport.code)) {
        // --- R1A04 REAL DATA: export the real fetched rows.
        rows =
          a104Rows.length > 0
            ? a104Rows.map((r) => ({
                'Journal No.': r.j_num,
                'Journal Code': r.j_code,
                Date: r.t_date,
                Payee: r.payee,
                Description: r.t_desc,
                'Check No.': r.ck_num,
                'Check Date': r.ck_date,
                'Account Code': r.at_code,
                'Account Name': r.at_desc,
                'Subsidiary Name': r.sl_name,
                Debit: r.debit,
                Credit: r.credit,
                Invoice: r.invoice,
                'Cost Center': r.cc_code,
              }))
            : [{ Report: selectedReport.name, Section: subCategory?.label ?? group.label }];
      } else {
        rows = getExportRows({
          categoryKey: group.key,
          reportCode: selectedReport.code,
          reportName: selectedReport.name,
          sectionLabel: subCategory?.label ?? group.label,
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        selectedReport.code.slice(0, 31),
      );

      const safeFileName = `${selectedReport.code}-${selectedReport.name}`
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim();

      XLSX.writeFile(workbook, `${safeFileName}.xlsx`);
    }

    // ---- Report selected: show filter card + preview ----
    if (group && subCategory && selectedReport) {
      if (isBrokenOnDesktopReportCode(selectedReport.code)) {
        return (
          <main className="max-w-7xl mx-auto px-4 py-8">
            <div className="w-full space-y-4">
              {renderBreadcrumb()}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleBackToReportList}
                  className="inline-flex items-center rounded-xl border border-[#d8dfea] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#101d3d] dark:text-white dark:hover:bg-[#122147]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </button>
              </div>
              <ReportUnavailableCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                reason="broken"
              />
            </div>
          </main>
        );
      }

      const previewHtml = getPreviewHtml({
        categoryKey: group.key,
        reportCode: selectedReport.code,
        reportName: selectedReport.name,
        sectionLabel: subCategory.label,
        isDark,
        journalEntries,
        accountActivityRows,
        unpostedRows,
        cashPositionRows,
        a104Rows,
        a105Rows,
        a106Rows,
        a061Rows,
        a107Rows,
        a081Rows,
        a082Rows,
        a083Rows,
        a084Rows,
        a085Rows,
        r2a01Rows,
        r2a02Rows,
        r2a03Rows,
        r3a01Rows,
        r3a02Rows,
        r3a03Rows,
        r3a04Rows,
        r4a02Rows,
        r4a03Rows,
        r4a05Rows,
        r4a06Rows,
        financialRows,
        salesRows,
        inventoryRows,
        companyInfo,
        companyBranchLabel: activeBranchLabel,
      });

      const isAccountActivity = isAccountActivityReportCode(selectedReport.code);
      const isListUnposted = isListUnpostedReportCode(selectedReport.code);
      const isCashPosition = isCashPositionReportCode(selectedReport.code);
      const isA104 = isUnpostedEntriesA104ReportCode(selectedReport.code);
      const isA105 = isAccountMovementSummaryReportCode(selectedReport.code);
      const isA106 = isSummaryInputTaxReportCode(selectedReport.code);
      const isA061 = isSummaryOutputTaxReportCode(selectedReport.code);
      const isA107 = isSummaryStatementAccountsReportCode(selectedReport.code);
      const isA081 = isUnbalanceJournalListReportCode(selectedReport.code);
      const isA082 = isSubsidiaryWithoutSubsidiaryReportCode(selectedReport.code);
      const isA083 = isMismatchAccountingPeriodReportCode(selectedReport.code);
      const isA084 = isWithoutAccountLinkReportCode(selectedReport.code);
      const isA085 = isSubsidiaryDiffAccountLinkReportCode(selectedReport.code);
      const isR2a01 = isCheckByEntryDateReportCode(selectedReport.code);
      const isR2a02 = isCheckByCheckDateReportCode(selectedReport.code);
      const isR2a03 = isCheckByCheckNumberReportCode(selectedReport.code);
      const isR3a01 = isGeneralJournalReportCode(selectedReport.code);
      const isR3a02 = isGLActivityByAccountIDReportCode(selectedReport.code);
      const isR3a03 = isGLByJournalIDReportCode(selectedReport.code);
      const isR3a04 = isGLSummaryByAccountIDReportCode(selectedReport.code);
      const isR4a02 = isBalancesFromCustomerReportCode(selectedReport.code);
      const isR4a03 = isCustomersAgingReportCode(selectedReport.code);
      const isR4a05 = isBalancesToSupplierReportCode(selectedReport.code);
      const isR4a06 = isSuppliersAgingReportCode(selectedReport.code);
      const isFinancial = isFinancialStatementReportCode(selectedReport.code);

      return (
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="w-full space-y-4">
            {renderBreadcrumb()}

            <div className="flex items-center">
              <button
                type="button"
                onClick={handleBackToReportList}
                className="inline-flex items-center rounded-xl border border-[#d8dfea] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#101d3d] dark:text-white dark:hover:bg-[#122147]"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </button>
            </div>

            {isListUnposted ? (
              // --- R1A02 REAL DATA: dedicated filter card (real Journal +
              // Period From/To dropdowns), instead of the generic
              // AccountingFilterCard used by every other report.
              <UnpostedEntriesFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={unpostedBranches}
                selectedBranch={selectedUnpostedBranch}
                onBranchChange={handleUnpostedBranchChange}
                journals={journals}
                periods={periods}
                selectedJournal={selectedJournal}
                onJournalChange={setSelectedJournal}
                selectedPeriodFrom={selectedPeriodFrom}
                onPeriodFromChange={setSelectedPeriodFrom}
                selectedPeriodTo={selectedPeriodTo}
                onPeriodToChange={setSelectedPeriodTo}
                onPreview={handlePreviewUnpostedEntries}
                onClear={handleClearUnpostedFilters}
                loading={unpostedLoading}
                error={unpostedError}
              />
            ) : isR3a02 ? (
              // --- R3A02: reuses CheckByCheckNumberFilterCard with full m04 accounts.
              <CheckByCheckNumberFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={r3a02Branches}
                selectedBranch={selectedR3a02Branch}
                onBranchChange={handleR3a02BranchChange}
                accounts={r3a02Accounts}
                selectedAccountFrom={selectedR3a02AccountFrom}
                onAccountFromChange={setSelectedR3a02AccountFrom}
                selectedAccountTo={selectedR3a02AccountTo}
                onAccountToChange={setSelectedR3a02AccountTo}
                journalBooks={r3a02Journals}
                selectedJournalBook={selectedR3a02Journal}
                onJournalBookChange={setSelectedR3a02Journal}
                onPreview={handlePreviewR3a02}
                onClear={handleClearR3a02Filters}
                loading={r3a02Loading}
                error={r3a02Error}
              />
            ) : isR3a03 ? (
              // --- R3A03 REAL DATA: Branch + Journal From/To + Entry Dates.
              // No Account ID, no Unposted/Posted checkboxes — same shape as R1A05.
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: handlePreviewR3a03,
                onClear: handleClearR3a03Filters,
                journalLoading: r3a03Loading,
                journalError: r3a03Error,
                realBranches: r3a03Branches,
                selectedRealBranch: selectedR3a03Branch,
                onRealBranchChange: handleR3a03BranchChange,
                realJournals: r3a03Journals,
                hideAccountId: true,
                hideEntryTypeCheckboxes: true,
              })
            ) : isR3a04 ? (
              // --- R3A04 REAL DATA: Branch + Account From/To + single Journal
              // + Entry Dates. Same filter shape as R3A02 (CheckByCheckNumberFilterCard).
              // Output is summary (one row per account) — different table below.
              <CheckByCheckNumberFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={r3a04Branches}
                selectedBranch={selectedR3a04Branch}
                onBranchChange={handleR3a04BranchChange}
                accounts={r3a04Accounts}
                selectedAccountFrom={selectedR3a04AccountFrom}
                onAccountFromChange={setSelectedR3a04AccountFrom}
                selectedAccountTo={selectedR3a04AccountTo}
                onAccountToChange={setSelectedR3a04AccountTo}
                journalBooks={r3a04Journals}
                selectedJournalBook={selectedR3a04Journal}
                onJournalBookChange={setSelectedR3a04Journal}
                onPreview={handlePreviewR3a04}
                onClear={handleClearR3a04Filters}
                loading={r3a04Loading}
                error={r3a04Error}
              />
            ) : isR4a02 ? (
              <SubledgerFilterCard
                reportName={selectedReport.name} reportCode={selectedReport.code}
                branches={subledgerBranches} selectedBranch={selectedR4a02Branch} onBranchChange={setSelectedR4a02Branch}
                accounts={subledgerAccounts} selectedAccount={selectedR4a02Account} onAccountChange={setSelectedR4a02Account}
                slNames={subledgerNames} selectedSlNameFrom={selectedR4a02SlFrom} onSlNameFromChange={setSelectedR4a02SlFrom}
                selectedSlNameTo={selectedR4a02SlTo} onSlNameToChange={setSelectedR4a02SlTo}
                asOf={r4a02AsOf} onAsOfChange={setR4a02AsOf}
                showSummaryOnly={false} summaryOnly={false} onSummaryOnlyChange={() => {}}
                showUnposted={r4a02ShowUnposted} onShowUnpostedChange={setR4a02ShowUnposted}
                showPosted={r4a02ShowPosted} onShowPostedChange={setR4a02ShowPosted}
                onPreview={() => void loadR4a02Report(r4a02AsOf, selectedR4a02Branch, selectedR4a02Account, selectedR4a02SlFrom, selectedR4a02SlTo, r4a02ShowUnposted, r4a02ShowPosted)}
                onClear={() => { const t = formatLocalDate(new Date()); setR4a02AsOf(t); setSelectedR4a02Account('all'); setSelectedR4a02SlFrom('all'); setSelectedR4a02SlTo('all'); setR4a02Rows([]); setR4a02Error(null); }}
                loading={r4a02Loading} error={r4a02Error}
                slFromLabel="Customer From" slToLabel="Customer To"
              />
            ) : isR4a03 ? (
              <SubledgerFilterCard
                reportName={selectedReport.name} reportCode={selectedReport.code}
                branches={subledgerBranches} selectedBranch={selectedR4a03Branch} onBranchChange={setSelectedR4a03Branch}
                accounts={subledgerAccounts} selectedAccount={selectedR4a03Account} onAccountChange={setSelectedR4a03Account}
                slNames={subledgerNames} selectedSlNameFrom={selectedR4a03SlFrom} onSlNameFromChange={setSelectedR4a03SlFrom}
                selectedSlNameTo={selectedR4a03SlTo} onSlNameToChange={setSelectedR4a03SlTo}
                asOf={r4a03AsOf} onAsOfChange={setR4a03AsOf}
                showSummaryOnly={true} summaryOnly={r4a03SummaryOnly} onSummaryOnlyChange={setR4a03SummaryOnly}
                showUnposted={r4a03ShowUnposted} onShowUnpostedChange={setR4a03ShowUnposted}
                showPosted={r4a03ShowPosted} onShowPostedChange={setR4a03ShowPosted}
                onPreview={() => void loadR4a03Report(r4a03AsOf, selectedR4a03Branch, selectedR4a03Account, selectedR4a03SlFrom, selectedR4a03SlTo, r4a03SummaryOnly, r4a03ShowUnposted, r4a03ShowPosted)}
                onClear={() => { const t = formatLocalDate(new Date()); setR4a03AsOf(t); setSelectedR4a03Account('all'); setSelectedR4a03SlFrom('all'); setSelectedR4a03SlTo('all'); setR4a03SummaryOnly(false); setR4a03Rows([]); setR4a03Error(null); }}
                loading={r4a03Loading} error={r4a03Error}
                slFromLabel="Customer From" slToLabel="Customer To"
              />
            ) : isR4a05 ? (
              <SubledgerFilterCard
                reportName={selectedReport.name} reportCode={selectedReport.code}
                branches={subledgerBranches} selectedBranch={selectedR4a05Branch} onBranchChange={setSelectedR4a05Branch}
                accounts={subledgerAccounts} selectedAccount={selectedR4a05Account} onAccountChange={setSelectedR4a05Account}
                slNames={subledgerNames} selectedSlNameFrom={selectedR4a05SlFrom} onSlNameFromChange={setSelectedR4a05SlFrom}
                selectedSlNameTo={selectedR4a05SlTo} onSlNameToChange={setSelectedR4a05SlTo}
                asOf={r4a05AsOf} onAsOfChange={setR4a05AsOf}
                showSummaryOnly={false} summaryOnly={false} onSummaryOnlyChange={() => {}}
                showUnposted={r4a05ShowUnposted} onShowUnpostedChange={setR4a05ShowUnposted}
                showPosted={r4a05ShowPosted} onShowPostedChange={setR4a05ShowPosted}
                onPreview={() => void loadR4a05Report(r4a05AsOf, selectedR4a05Branch, selectedR4a05Account, selectedR4a05SlFrom, selectedR4a05SlTo, r4a05ShowUnposted, r4a05ShowPosted)}
                onClear={() => { const t = formatLocalDate(new Date()); setR4a05AsOf(t); setSelectedR4a05Account('all'); setSelectedR4a05SlFrom('all'); setSelectedR4a05SlTo('all'); setR4a05Rows([]); setR4a05Error(null); }}
                loading={r4a05Loading} error={r4a05Error}
                slFromLabel="Supplier From" slToLabel="Supplier To"
              />
            ) : isR4a06 ? (
              <SubledgerFilterCard
                reportName={selectedReport.name} reportCode={selectedReport.code}
                branches={subledgerBranches} selectedBranch={selectedR4a06Branch} onBranchChange={setSelectedR4a06Branch}
                accounts={subledgerAccounts} selectedAccount={selectedR4a06Account} onAccountChange={setSelectedR4a06Account}
                slNames={subledgerNames} selectedSlNameFrom={selectedR4a06SlFrom} onSlNameFromChange={setSelectedR4a06SlFrom}
                selectedSlNameTo={selectedR4a06SlTo} onSlNameToChange={setSelectedR4a06SlTo}
                asOf={r4a06AsOf} onAsOfChange={setR4a06AsOf}
                showSummaryOnly={true} summaryOnly={r4a06SummaryOnly} onSummaryOnlyChange={setR4a06SummaryOnly}
                showUnposted={r4a06ShowUnposted} onShowUnpostedChange={setR4a06ShowUnposted}
                showPosted={r4a06ShowPosted} onShowPostedChange={setR4a06ShowPosted}
                onPreview={() => void loadR4a06Report(r4a06AsOf, selectedR4a06Branch, selectedR4a06Account, selectedR4a06SlFrom, selectedR4a06SlTo, r4a06SummaryOnly, r4a06ShowUnposted, r4a06ShowPosted)}
                onClear={() => { const t = formatLocalDate(new Date()); setR4a06AsOf(t); setSelectedR4a06Account('all'); setSelectedR4a06SlFrom('all'); setSelectedR4a06SlTo('all'); setR4a06SummaryOnly(false); setR4a06Rows([]); setR4a06Error(null); }}
                loading={r4a06Loading} error={r4a06Error}
                slFromLabel="Supplier From" slToLabel="Supplier To"
              />
            ) : isFinancial ? (
              // --- FINANCIAL STATEMENTS: shared filter card for all 11 reports.
              <FinancialStatementFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={financialBranches}
                selectedBranch={selectedFinancialBranch}
                onBranchChange={setSelectedFinancialBranch}
                periods={financialPeriods}
                selectedPeriodFrom={selectedFinancialPeriodFrom}
                onPeriodFromChange={setSelectedFinancialPeriodFrom}
                selectedPeriodTo={selectedFinancialPeriodTo}
                onPeriodToChange={setSelectedFinancialPeriodTo}
                years={financialYears}
                selectedYear={selectedFinancialYear}
                onYearChange={setSelectedFinancialYear}
                viewAs={selectedFinancialViewAs}
                onViewAsChange={setSelectedFinancialViewAs}
                showYearToDate={selectedReport.code === TRIAL_BALANCE_CODE}
                yearToDate={financialYearToDate}
                onYearToDateChange={setFinancialYearToDate}
                showCompareBudget={selectedReport.code === INCOME_STATEMENT_LIST_CODE}
                compareBudget={financialCompareBudget}
                onCompareBudgetChange={setFinancialCompareBudget}
                isYearReport={isFinancialYearReport(selectedReport.code)}
                onPreview={() => void loadFinancialReport(selectedReport.code)}
                onClear={() => { setFinancialRows([]); setFinancialError(null); setFinancialYearToDate(false); setFinancialCompareBudget(false); setSelectedFinancialViewAs('posted'); }}
                loading={financialLoading}
                error={financialError}
              />
            ) : isR3a01 ? (
              <MismatchPeriodFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={r3a01Branches}
                selectedBranch={selectedR3a01Branch}
                onBranchChange={handleR3a01BranchChange}
                periods={r3a01Periods}
                selectedPeriod={selectedR3a01Period}
                onPeriodChange={setSelectedR3a01Period}
                onPreview={handlePreviewR3a01}
                onClear={handleClearR3a01Filters}
                loading={r3a01Loading}
                error={r3a01Error}
              />
            ) : isR2a03 ? (
              <CheckByCheckNumberFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={r2a03Branches}
                selectedBranch={selectedR2a03Branch}
                onBranchChange={handleR2a03BranchChange}
                accounts={r2a03Accounts}
                selectedAccountFrom={selectedR2a03AccountFrom}
                onAccountFromChange={setSelectedR2a03AccountFrom}
                selectedAccountTo={selectedR2a03AccountTo}
                onAccountToChange={setSelectedR2a03AccountTo}
                journalBooks={r2a03JournalBooks}
                selectedJournalBook={selectedR2a03JournalBook}
                onJournalBookChange={setSelectedR2a03JournalBook}
                onPreview={handlePreviewR2a03}
                onClear={handleClearR2a03Filters}
                loading={r2a03Loading}
                error={r2a03Error}
              />
            ) : isR2a02 ? (
              <CheckByEntryDateFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={r2a02Branches}
                selectedBranch={selectedR2a02Branch}
                onBranchChange={handleR2a02BranchChange}
                accounts={r2a02Accounts}
                selectedAccountFrom={selectedR2a02AccountFrom}
                onAccountFromChange={setSelectedR2a02AccountFrom}
                selectedAccountTo={selectedR2a02AccountTo}
                onAccountToChange={setSelectedR2a02AccountTo}
                onPreview={handlePreviewR2a02}
                onClear={handleClearR2a02Filters}
                loading={r2a02Loading}
                error={r2a02Error}
              />
            ) : isR2a01 ? (
              <CheckByEntryDateFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={r2a01Branches}
                selectedBranch={selectedR2a01Branch}
                onBranchChange={handleR2a01BranchChange}
                accounts={r2a01Accounts}
                selectedAccountFrom={selectedR2a01AccountFrom}
                onAccountFromChange={setSelectedR2a01AccountFrom}
                selectedAccountTo={selectedR2a01AccountTo}
                onAccountToChange={setSelectedR2a01AccountTo}
                onPreview={handlePreviewR2a01}
                onClear={handleClearR2a01Filters}
                loading={r2a01Loading}
                error={r2a01Error}
              />
            ) : isA085 ? (
              // --- R1A085: same filter layout as R1A083 — reuses MismatchPeriodFilterCard.
              <MismatchPeriodFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={a085Branches}
                selectedBranch={selectedA085Branch}
                onBranchChange={handleA085BranchChange}
                periods={a085Periods}
                selectedPeriod={selectedA085Period}
                onPeriodChange={setSelectedA085Period}
                onPreview={handlePreviewA085}
                onClear={handleClearA085Filters}
                loading={a085Loading}
                error={a085Error}
              />
            ) : isA084 ? (
              <WithoutAccountLinkFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={a084Branches}
                selectedBranch={selectedA084Branch}
                onBranchChange={handleA084BranchChange}
                periods={a084Periods}
                selectedPeriod={selectedA084Period}
                onPeriodChange={setSelectedA084Period}
                onPreview={handlePreviewA084}
                onClear={handleClearA084Filters}
                loading={a084Loading}
                error={a084Error}
              />
            ) : isA083 ? (
              // --- R1A083: Branch + Accounting Period (single picker).
              <MismatchPeriodFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={a083Branches}
                selectedBranch={selectedA083Branch}
                onBranchChange={handleA083BranchChange}
                periods={a083Periods}
                selectedPeriod={selectedA083Period}
                onPeriodChange={setSelectedA083Period}
                onPreview={handlePreviewA083}
                onClear={handleClearA083Filters}
                loading={a083Loading}
                error={a083Error}
              />
            ) : isA082 ? (
              <UnbalanceJournalFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={a082Branches}
                selectedBranch={selectedA082Branch}
                onBranchChange={handleA082BranchChange}
                accounts={a082Accounts}
                selectedAccount={selectedA082Account}
                onAccountChange={handleA082AccountChange}
                onPreview={handlePreviewA082}
                onClear={handleClearA082Filters}
                loading={a082Loading}
                error={a082Error}
              />
            ) : isA081 ? (
              // --- R1A081: Branch + Account Title (m04) + Entry Dates.
              <UnbalanceJournalFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={a081Branches}
                selectedBranch={selectedA081Branch}
                onBranchChange={handleA081BranchChange}
                accounts={a081Accounts}
                selectedAccount={selectedA081Account}
                onAccountChange={handleA081AccountChange}
                onPreview={handlePreviewA081}
                onClear={handleClearA081Filters}
                loading={a081Loading}
                error={a081Error}
              />
            ) : isA107 ? (
              // --- R1A07: Entry Dates only — hide Branch, Journal, Account ID, checkboxes.
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: handlePreviewA107,
                onClear: handleClearA107Filters,
                journalLoading: a107Loading,
                journalError: a107Error,
                hideAccountId: true,
                hideJournalFromTo: true,
                hideEntryTypeCheckboxes: true,
                hideBranch: true,
              })
            ) : isA061 ? (
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: handlePreviewA061,
                onClear: handleClearA061Filters,
                journalLoading: a061Loading,
                journalError: a061Error,
                realBranches: a061Branches,
                selectedRealBranch: selectedA061Branch,
                onRealBranchChange: handleA061BranchChange,
                hideAccountId: true,
                hideJournalFromTo: true,
                hideEntryTypeCheckboxes: true,
              })
            ) : isA106 ? (
              // --- R1A06 REAL DATA: Branch + Entry Dates only.
              // No Journal From/To, no Account ID, no Unposted/Posted.
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: handlePreviewA106,
                onClear: handleClearA106Filters,
                journalLoading: a106Loading,
                journalError: a106Error,
                realBranches: a106Branches,
                selectedRealBranch: selectedA106Branch,
                onRealBranchChange: handleA106BranchChange,
                hideAccountId: true,
                hideJournalFromTo: true,
                hideEntryTypeCheckboxes: true,
              })
            ) : isA105 ? (
              // --- R1A05 REAL DATA: same AccountingFilterCard as R1A01 but
              // without Account ID (desktop A107 has no account filter).
              // Branch and Journal From/To use real data same as R1A01.
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: handlePreviewA105,
                onClear: handleClearA105Filters,
                journalLoading: a105Loading,
                journalError: a105Error,
                realBranches: a105Branches,
                selectedRealBranch: selectedA105Branch,
                onRealBranchChange: handleA105BranchChange,
                realJournals: a105Journals,
                hideAccountId: true,
                hideEntryTypeCheckboxes: true,
              })
            ) : isA104 ? (
              // --- R1A04 REAL DATA: same filter card as R1A02 (UnpostedEntriesFilterCard)
              // — Branch, Journal, Period From/To — just with its own state and handlers.
              <UnpostedEntriesFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                branches={a104Branches}
                selectedBranch={selectedA104Branch}
                onBranchChange={handleA104BranchChange}
                journals={a104Journals}
                periods={a104Periods}
                selectedJournal={selectedA104Journal}
                onJournalChange={setSelectedA104Journal}
                selectedPeriodFrom={selectedA104PeriodFrom}
                onPeriodFromChange={setSelectedA104PeriodFrom}
                selectedPeriodTo={selectedA104PeriodTo}
                onPeriodToChange={setSelectedA104PeriodTo}
                onPreview={handlePreviewA104}
                onClear={handleClearA104Filters}
                loading={a104Loading}
                error={a104Error}
              />
            ) : isCashPosition ? (
              // --- R1A03 REAL DATA: dedicated filter card. Account ID is a
              // required dropdown (no "All"), adds Financial Year and
              // Include Previous — none of which the generic
              // AccountingFilterCard supports.
              <CashPositionFilterCard
                reportName={selectedReport.name}
                reportCode={selectedReport.code}
                journalFilters={journalFilters}
                onJournalFiltersChange={setJournalFilters}
                branches={cashPositionBranches}
                branch={selectedCashPositionBranch}
                onBranchChange={handleCashPositionBranchChange}
                accounts={cashPositionAccounts}
                selectedAccount={selectedCashPositionAccount}
                onAccountChange={handleCashPositionAccountChange}
                fyOptions={cashPositionFyOptions}
                selectedFy={selectedCashPositionFy}
                onFyChange={setSelectedCashPositionFy}
                includePrevious={includePreviousCashPosition}
                onIncludePreviousChange={setIncludePreviousCashPosition}
                onPreview={handlePreviewCashPosition}
                onClear={handleClearCashPositionFilters}
                loading={cashPositionLoading}
                error={cashPositionError}
              />
            ) : isSalesReport(selectedReport.code) ? (
            <SalesFilterCard
              reportCode={selectedReport.code}
              onPreview={loadOTCSales}
              loading={salesLoading}
              error={salesError}
            />
          ) : isInventoryReport(selectedReport.code) ? (
            <InventoryFilterCard
              reportCode={selectedReport.code}
              onPreview={loadInventoryReport}
              loading={inventoryLoading}
              error={inventoryError}
            />
          ) : (
              renderFilterCard({
                categoryKey: group.key,
                reportName: selectedReport.name,
                reportCode: selectedReport.code,
                journalFilters,
                onJournalFiltersChange: setJournalFilters,
                onPreview: isAccountActivity
                  ? handlePreviewAccountActivity
                  : handlePreviewJournalEntries,
                onClear: isAccountActivity
                  ? handleClearAccountActivityFilters
                  : handleClearJournalFilters,
                journalLoading: isAccountActivity ? accountActivityLoading : journalLoading,
                journalError: isAccountActivity ? accountActivityError : journalError,
                // --- R1A01 REAL DATA (branch fix): only passed (and only
                // rendered as a real dropdown) for R1A01. R1A08x journal
                // reports keep the old static placeholder untouched.
                realBranches: isAccountActivity ? accountActivityBranches : undefined,
                selectedRealBranch: isAccountActivity ? selectedAccountActivityBranch : undefined,
                onRealBranchChange: isAccountActivity ? handleAccountActivityBranchChange : undefined,
                realJournals: isAccountActivity ? accountActivityJournals : undefined,
                realAccounts: isAccountActivity ? accountActivityAccounts : undefined,
                selectedRealAccount: isAccountActivity ? selectedAccountActivityAccount : undefined,
                onRealAccountChange: isAccountActivity ? handleAccountActivityAccountChange : undefined,
              })
            )}

            <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                  <Button
                    type="button"
                    onClick={handlePrintPreview}
                    className="h-11 w-full bg-[#1570ef] text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>

                  <Button
                    type="button"
                    onClick={handleExportExcel}
                    variant="outline"
                    className="h-11 w-full border-[#d8dfea] bg-white text-slate-700 hover:bg-slate-100 sm:w-auto dark:border-white/10 dark:bg-[#101d3d] dark:text-white dark:hover:bg-[#122147]"
                  >
                    Export Excel
                  </Button>
                </div>

                <div className="print-area overflow-hidden rounded-2xl border border-[#d8dfea] bg-white shadow-sm dark:border-white/10 dark:bg-[#101d3d]">
                  <iframe
                    ref={iframeRef}
                    title={`${selectedReport.code} preview`}
                    srcDoc={previewHtml}
                    className="h-[70vh] min-h-[420px] w-full bg-transparent sm:h-[620px]"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ctrl+P prints the whole page by default. This hides everything
              except the report preview iframe, so a manual browser print
              behaves the same as clicking "Export PDF". */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              .print-area,
              .print-area * {
                visibility: visible !important;
              }
              .print-area {
                position: fixed;
                inset: 0;
                width: 100% !important;
                height: 100% !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
              }
              .print-area iframe {
                width: 100% !important;
                height: 100% !important;
                border: none !important;
              }
            }
          `}</style>
        </main>
      );
    }

    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div>
          {renderBreadcrumb()}

          <h1 className="mb-1 text-2xl font-semibold tracking-tight sm:text-[28px]">
            Reports
          </h1>
          <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
            Browse and choose a report type to view and analyze your data.
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-4">
              <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
                <CardContent className="p-4">
                  <h2 className="mb-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    Report groups
                  </h2>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    Select a category to view available reports.
                  </p>

                  <div className="flex flex-col gap-1">
                    {reportsData.map((g) => {
                      const Icon = groupIcons[g.key as keyof typeof groupIcons] || Building2;
                      const isActive = g.key === groupKey;
                      const theme = groupTheme[g.key];

                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => selectGroup(g.key)}
                          className={`flex items-center justify-between rounded-xl px-2.5 py-2.5 text-left transition ${
                            isActive
                              ? 'bg-orange-50 dark:bg-orange-500/10'
                              : 'hover:bg-[#f3f5f8] dark:hover:bg-white/5'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${theme.chip}`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-semibold leading-tight ${
                                  isActive
                                    ? 'text-[#ea580c] dark:text-orange-300'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {g.label}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {g.subCategories.length} report type
                                {g.subCategories.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
                <CardContent className="flex gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#cfe0ff] bg-[#eef4ff] text-[#2563eb] dark:border-white/10 dark:bg-[#101d3d] dark:text-[#7cb3ff]">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Need help?
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Learn how to generate and customize reports.
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-[#2563eb] hover:underline dark:text-[#7cb3ff]"
                    >
                      View guide
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0">
              {group && !subCategory && (
                <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                          {group.label}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {group.subCategories.length} report type
                          {group.subCategories.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="relative w-full max-w-[220px]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={subSearch}
                          onChange={(e) => setSubSearch(e.target.value)}
                          placeholder={`Search ${group.label.toLowerCase()}...`}
                          className="h-8 rounded-lg border-[#cfd6e4] bg-white pl-8 text-xs dark:border-white/10 dark:bg-white/5"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {filteredSubs.map((sub) => {
                        const theme = groupTheme[group.key];
                        const count = itemCount(sub);

                        return (
                          <button
                            key={sub.key}
                            type="button"
                            onClick={() => selectSub(sub.key)}
                            className="flex items-start justify-between gap-3 rounded-xl border border-[#d8dfea] bg-white p-3.5 text-left transition hover:border-[#c3ccdc] hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${theme.card}`}
                              >
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">
                                  {sub.label}
                                </p>
                                <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
                                  {count} report{count > 1 ? 's' : ''} available
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                          </button>
                        );
                      })}

                      {filteredSubs.length === 0 && (
                        <p className="col-span-full py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          No report types match "{subSearch}".
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {group && subCategory && (
                <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <button
                          type="button"
                          onClick={() => setSubKey(null)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        >
                          ← Back to {group.label}
                        </button>
                        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                          {subCategory.label}
                        </h2>
                      </div>
                      <div className="relative w-full max-w-[220px]">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          placeholder="Search reports..."
                          className="h-8 rounded-lg border-[#cfd6e4] bg-white pl-8 text-xs dark:border-white/10 dark:bg-white/5"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-5">
                      {filteredSections.map((section) => (
                        <div key={section.key}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            {section.label}
                          </p>
                          <div className="divide-y divide-[#d8dfea] rounded-xl border border-[#d8dfea] bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
                            {section.items.map((item) => (
                              <button
                                key={item.code}
                                type="button"
                                onClick={() => handleReportSelect(item.code)}
                                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-[#f3f5f8] dark:hover:bg-white/5"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-tight text-slate-900 dark:text-white">
                                    {item.name}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                    {item.code}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {filteredSections.length === 0 && (
                        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          No reports match "{itemSearch}".
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Filter cards (ported from CategoryPanel.tsx)
  // ---------------------------------------------------------------------------

  function renderFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    onPreview,
    onClear,
    journalLoading,
    journalError,
    realBranches,
    selectedRealBranch,
    onRealBranchChange,
    realJournals,
    realAccounts,
    selectedRealAccount,
    onRealAccountChange,
    hideAccountId,
    hideEntryTypeCheckboxes,
    hideJournalFromTo,
    hideBranch,
  }: {
    categoryKey: string;
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    onPreview: () => void;
    onClear: () => void;
    journalLoading: boolean;
    journalError: string | null;
    realBranches?: { value: string; label: string }[];
    selectedRealBranch?: string;
    onRealBranchChange?: (v: string) => void;
    realJournals?: JournalOption[];
    realAccounts?: { value: string; label: string }[];
    selectedRealAccount?: string;
    onRealAccountChange?: (v: string) => void;
    hideAccountId?: boolean;
    hideEntryTypeCheckboxes?: boolean;
    hideJournalFromTo?: boolean;
    hideBranch?: boolean;
  }) {
    return (
      <AccountingFilterCard
        reportName={reportName}
        reportCode={reportCode}
        journalFilters={journalFilters}
        onJournalFiltersChange={onJournalFiltersChange}
        onPreview={onPreview}
        onClear={onClear}
        journalLoading={journalLoading}
        journalError={journalError}
        realBranches={realBranches}
        selectedRealBranch={selectedRealBranch}
        onRealBranchChange={onRealBranchChange}
        realJournals={realJournals}
        realAccounts={realAccounts}
        selectedRealAccount={selectedRealAccount}
        onRealAccountChange={onRealAccountChange}
        hideAccountId={hideAccountId}
        hideEntryTypeCheckboxes={hideEntryTypeCheckboxes}
        hideJournalFromTo={hideJournalFromTo}
        hideBranch={hideBranch}
      />
    );
  }

  function isInventoryCategory(categoryKey: string) {
    return categoryKey.toLowerCase().includes('inventory');
  }

  function isSalesCategory(categoryKey: string) {
    return categoryKey.toLowerCase().includes('sales');
  }

  // Reports confirmed BROKEN on the desktop source app itself — not a
  // data or web-build issue, there's nothing to replicate. Add codes here
  // as more broken-on-desktop reports are confirmed.
  const BROKEN_ON_DESKTOP_REPORT_CODES = [
    'R1S00', 'R3S00', 'R5S00', // stub errors on desktop
    'R8I00',                    // "Empty report code." on desktop
    'R1C01', 'R1C02',           // CRM Reports — desktop shows nothing under either
  ];

  function isBrokenOnDesktopReportCode(code?: string) {
    return !!code && BROKEN_ON_DESKTOP_REPORT_CODES.includes(code);
  }

  function isSalesReport(reportCode?: string) {
    if (!reportCode) return false;

    return [
      'R1O00',
      'R1S00',
      'R2O00',
      'R2S00',
      'R3O00',
      'R3S00',
      'R4O00',
      'R4S00',
      'R5O00',
      'R5S00',
      'R6O00',
      'R6S00',
    ].includes(reportCode);
  }

  // --- INVENTORY REAL DATA: all 26 Inventory Report codes, confirmed
  // directly from reports-data.ts (letter "I" throughout, e.g. R1I01 —
  // learned from the Sales Reports letter-O/digit-0 mixup not to guess).
  function isInventoryReport(reportCode?: string) {
    if (!reportCode) return false;

    return [
      'R1I01', 'R1I02', 'R1I03', // Purchase Request Reports
      'R2I01', 'R2I03', 'R2I04', // Purchase Orders
      'R3I01', 'R3I02', 'R3I03', // Receiving P.O.
      'R4I01', 'R4I02', 'R4I03', 'R4I04', // Direct Purchases
      'R5I01', 'R5I02', 'R5I03', 'R5I04', // Stock Issuance
      'R6I01', 'R6I02', 'R6I03', // Stock Transfer
      'R7I01', 'R7I02', 'R7I03', // Stock Adjustment
      'R8I00', // Item Transaction Card
      'R9I00', // Inventory Summary By Date
      'R10I00', // Inventory Valuation
      'R11I00', // Reorder Level Report
    ].includes(reportCode);
  }

  // Compact version -- same "By Branch" / "Entry Details" grouped-box structure
  // as before, but tighter padding, smaller inputs, and less vertical space
  // between fields, closer to the reference system's density (not its retro
  // visual style, just how little room it takes up).
  function ReportUnavailableCard({
    reportName,
    reportCode,
    reason,
  }: {
    reportName: string;
    reportCode: string;
    reason: 'broken' | 'not_built';
  }) {
    const message =
      reason === 'broken'
        ? "This report is unavailable — it doesn't work on the source system either, so there's nothing to display."
        : "This report hasn't been built yet. Check back later.";

    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-6 text-center">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>
          <p className="py-8 text-sm text-slate-500 dark:text-slate-400">
            {message}
          </p>
        </CardContent>
      </Card>
    );
  }

  function AccountingFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    onPreview,
    onClear,
    journalLoading,
    journalError,
    realBranches,
    selectedRealBranch,
    onRealBranchChange,
    realJournals,
    realAccounts,
    selectedRealAccount,
    onRealAccountChange,
    hideAccountId = false,
    hideEntryTypeCheckboxes = false,
    hideJournalFromTo = false,
    hideBranch = false,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    onPreview: () => void;
    onClear: () => void;
    journalLoading: boolean;
    journalError: string | null;
    realBranches?: { value: string; label: string }[];
    selectedRealBranch?: string;
    onRealBranchChange?: (v: string) => void;
    realJournals?: JournalOption[];
    realAccounts?: { value: string; label: string }[];
    selectedRealAccount?: string;
    onRealAccountChange?: (v: string) => void;
    hideAccountId?: boolean;
    hideEntryTypeCheckboxes?: boolean;
    hideJournalFromTo?: boolean;
    hideBranch?: boolean;
  }) {
    // --- R1A01 REAL DATA: renamed from `isJournal` -> `isWired`, now also
    // true for R1A01/R1A02/R1A03, so its Preview/Clear buttons are live
    // instead of inert.
    const isWired = isWiredReportCode(reportCode);
    // --- R1A01 REAL DATA (branch fix): real dropdown only when the caller
    // actually passed real branch data (currently just R1A01). Every other
    // report using this shared card keeps the old static placeholder.
    const hasRealBranches = !!realBranches && !!onRealBranchChange;

    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          {/* Title bar -- no underline, spacing alone separates it from the fields below */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              {!hideBranch && (
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Branch
                    </label>
                    {hasRealBranches ? (
                      <Select value={selectedRealBranch} onValueChange={onRealBranchChange}>
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {realBranches!.map((b) => (
                            <SelectItem key={b.value} value={b.value}>
                              {b.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select defaultValue="head-office">
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="head-office">HEAD OFFICE</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {!hideAccountId && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Account ID
                    </label>
                    {realAccounts && onRealAccountChange ? (
                      <Select
                        value={selectedRealAccount || 'all'}
                        onValueChange={onRealAccountChange}
                      >
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          {realAccounts.map((a) => (
                            <SelectItem key={a.value} value={a.value}>
                              {a.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select defaultValue="all">
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  )}
                </div>
              </div>
              )}

              {/* Entry Details group -- background tint only, no border */}
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Entry Details
                </p>
                <div className="space-y-2">
                  {!hideJournalFromTo && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Journal From
                      </label>
                      {realJournals ? (
                        <Select
                          value={journalFilters.journalFrom || 'any'}
                          onValueChange={(v) =>
                            onJournalFiltersChange({
                              ...journalFilters,
                              journalFrom: v === 'any' ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">All</SelectItem>
                            {realJournals.map((j) => (
                              <SelectItem key={j.value} value={j.value}>
                                {j.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={journalFilters.journalFrom}
                          onChange={(e) =>
                            onJournalFiltersChange({
                              ...journalFilters,
                              journalFrom: e.target.value,
                            })
                          }
                          className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Journal To
                      </label>
                      {realJournals ? (
                        <Select
                          value={journalFilters.journalTo || 'any'}
                          onValueChange={(v) =>
                            onJournalFiltersChange({
                              ...journalFilters,
                              journalTo: v === 'any' ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                            <SelectValue placeholder="All" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">All</SelectItem>
                            {realJournals.map((j) => (
                              <SelectItem key={j.value} value={j.value}>
                                {j.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={journalFilters.journalTo}
                          onChange={(e) =>
                            onJournalFiltersChange({
                              ...journalFilters,
                              journalTo: e.target.value,
                            })
                          }
                          className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                        />
                      )}
                    </div>
                  </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date From
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) =>
                          onJournalFiltersChange({
                            ...journalFilters,
                            dateFrom: e.target.value,
                          })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date To
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) =>
                          onJournalFiltersChange({
                            ...journalFilters,
                            dateTo: e.target.value,
                          })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>

                  {!hideEntryTypeCheckboxes && (
                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <div className="flex items-center space-x-1.5">
                      <Checkbox
                        id="unposted"
                        checked={journalFilters.showUnposted}
                        onCheckedChange={(checked) =>
                          onJournalFiltersChange({
                            ...journalFilters,
                            showUnposted: checked === true,
                          })
                        }
                      />
                      <label
                        htmlFor="unposted"
                        className="text-xs text-slate-700 dark:text-slate-200"
                      >
                        Unposted Entries
                      </label>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <Checkbox
                        id="posted"
                        checked={journalFilters.showPosted}
                        onCheckedChange={(checked) =>
                          onJournalFiltersChange({
                            ...journalFilters,
                            showPosted: checked === true,
                          })
                        }
                      />
                      <label
                        htmlFor="posted"
                        className="text-xs text-slate-700 dark:text-slate-200"
                      >
                        Posted Entries
                      </label>
                    </div>
                  </div>
                  )}

                  {isWired && journalError && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">
                      {journalError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={isWired ? onPreview : undefined}
                disabled={isWired && journalLoading}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {isWired && journalLoading ? 'Loading...' : 'Preview'}
              </Button>

              <Button
                type="button"
                onClick={isWired ? onClear : undefined}
                variant="outline"
                className={clearFieldsButtonClass + ' text-sm'}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R1A02 REAL DATA: dedicated filter card with real Journal + Period
  // From/To dropdowns (populated from live API data), instead of the free-
  // text Journal From/To + calendar-date fields AccountingFilterCard uses
  // for every other report — matches the real desktop screen's layout
  // (By Branch / Journal / Period From / Period To, confirmed via
  // screenshot).
  function UnpostedEntriesFilterCard({
    reportName,
    reportCode,
    branches,
    selectedBranch,
    onBranchChange,
    journals,
    periods,
    selectedJournal,
    onJournalChange,
    selectedPeriodFrom,
    onPeriodFromChange,
    selectedPeriodTo,
    onPeriodToChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    journals: JournalOption[];
    periods: PeriodOption[];
    selectedJournal: string;
    onJournalChange: (v: string) => void;
    selectedPeriodFrom: string;
    onPeriodFromChange: (v: string) => void;
    selectedPeriodTo: string;
    onPeriodToChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Branch
                  </label>
                  {/* --- R1A02 REAL DATA: real branch list (confirmed against
                      both DV_BRANCHES elsewhere in this codebase and the
                      actual desktop app's Branch dropdown), replacing the
                      old single-option "HEAD OFFICE" placeholder. Changing
                      branch reloads the Journal dropdown for that branch. */}
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Journal
                    </label>
                    <Select value={selectedJournal || 'all'} onValueChange={(v) => onJournalChange(v === 'all' ? '' : v)}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All journals" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {journals.map((j) => (
                          <SelectItem key={j.value} value={j.value}>
                            {j.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Period From
                      </label>
                      <Select value={selectedPeriodFrom} onValueChange={onPeriodFromChange}>
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        To
                      </label>
                      <Select value={selectedPeriodTo} onValueChange={onPeriodToChange}>
                        <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">
                      {error}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>

              <Button
                type="button"
                onClick={onClear}
                variant="outline"
                className={clearFieldsButtonClass + ' text-sm'}
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R1A03 REAL DATA: dedicated filter card. Account ID is a required
  // dropdown (no "All"), adds Financial Year and Include Previous — none of
  // which the generic AccountingFilterCard supports.
  function CashPositionFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    branches,
    branch,
    onBranchChange,
    accounts,
    selectedAccount,
    onAccountChange,
    fyOptions,
    selectedFy,
    onFyChange,
    includePrevious,
    onIncludePreviousChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    branches: { value: string; label: string }[];
    branch: string;
    onBranchChange: (v: string) => void;
    accounts: { value: string; label: string }[];
    selectedAccount: string;
    onAccountChange: (v: string) => void;
    fyOptions: number[];
    selectedFy: string;
    onFyChange: (v: string) => void;
    includePrevious: boolean;
    onIncludePreviousChange: (v: boolean) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Branch
                    </label>
                    <Select value={branch} onValueChange={onBranchChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.value} value={b.value}>
                            {b.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Account
                    </label>
                    <Select value={selectedAccount || undefined} onValueChange={onAccountChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Entry Details
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Financial Year
                    </label>
                    <Select value={selectedFy} onValueChange={onFyChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {fyOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date From
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateFrom: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date To
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateTo: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-0.5">
                    <div className="flex items-center space-x-1.5">
                      <Checkbox
                        id="cib-unposted"
                        checked={journalFilters.showUnposted}
                        onCheckedChange={(checked) =>
                          onJournalFiltersChange({ ...journalFilters, showUnposted: checked === true })
                        }
                      />
                      <label htmlFor="cib-unposted" className="text-xs text-slate-700 dark:text-slate-200">
                        Unposted Entries
                      </label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Checkbox
                        id="cib-posted"
                        checked={journalFilters.showPosted}
                        onCheckedChange={(checked) =>
                          onJournalFiltersChange({ ...journalFilters, showPosted: checked === true })
                        }
                      />
                      <label htmlFor="cib-posted" className="text-xs text-slate-700 dark:text-slate-200">
                        Posted Entries
                      </label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Checkbox
                        id="cib-include-previous"
                        checked={includePrevious}
                        onCheckedChange={(checked) => onIncludePreviousChange(checked === true)}
                      />
                      <label
                        htmlFor="cib-include-previous"
                        className="text-xs text-slate-700 dark:text-slate-200"
                      >
                        Include Previous
                      </label>
                    </div>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading || !selectedAccount}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>

              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R1A081 REAL DATA: dedicated filter card — Branch + Account Title
  // (full m04 list, labeled "Account Title" not "Account ID") + Entry Dates.
  // No Journal From/To, no Unposted/Posted checkboxes.
  function UnbalanceJournalFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    branches,
    selectedBranch,
    onBranchChange,
    accounts,
    selectedAccount,
    onAccountChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    accounts: { value: string; label: string }[];
    selectedAccount: string;
    onAccountChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Branch
                  </label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Account Title
                    </label>
                    <Select value={selectedAccount} onValueChange={onAccountChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date From
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateFrom: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date To
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateTo: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R2A01 REAL DATA: dedicated filter card — Branch + Account From/To
  // (both from m04) + Entry Dates. New pattern: account range selector.
  function CheckByEntryDateFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    branches,
    selectedBranch,
    onBranchChange,
    accounts,
    selectedAccountFrom,
    onAccountFromChange,
    selectedAccountTo,
    onAccountToChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    accounts: { value: string; label: string }[];
    selectedAccountFrom: string;
    onAccountFromChange: (v: string) => void;
    selectedAccountTo: string;
    onAccountToChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Branch
                  </label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Account From
                    </label>
                    <Select value={selectedAccountFrom} onValueChange={onAccountFromChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Account To
                    </label>
                    <Select value={selectedAccountTo} onValueChange={onAccountToChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date From
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateFrom: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date To
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateTo: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R2A01 REAL DATA: preview HTML with check-specific columns.
  function buildCheckByEntryDatePreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    entries: CheckEntryRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const fmtAmount = (n: number) =>
      n === 0 ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml =
      entries.length > 0
        ? entries.map((e) => `
            <tr>
              <td>${escapeHtml(e.date ?? '')}</td>
              <td>${escapeHtml(e.j_num ?? '')}</td>
              <td>${escapeHtml(e.ck_num ?? '')}</td>
              <td>${escapeHtml(e.ck_date ?? '')}</td>
              <td>${escapeHtml(e.payee ?? '')}</td>
              <td>${escapeHtml(e.at_code ?? '')}</td>
              <td>${escapeHtml(e.at_desc ?? '')}</td>
              <td class="right">${escapeHtml(fmtAmount(e.debit ?? 0))}</td>
              <td class="right">${escapeHtml(fmtAmount(e.credit ?? 0))}</td>
            </tr>`).join('')
        : `<tr><td colspan="9" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 12px; color: ${bodyText}; background: ${bodyBg}; }
            .sheet { width: 100%; max-width: 1300px; margin: 0 auto; border: 1px dashed ${sheetBorder}; padding: 14px; background: ${sheetBg}; }
            .top { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
            .title h1 { margin: 0; font-size: clamp(18px, 3.5vw, 22px); line-height: 1.2; word-break: break-word; }
            .subtitle { margin-top: 6px; font-size: 13px; color: ${subtitleColor}; }
            .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            table { width: 100%; min-width: 1200px; border-collapse: collapse; font-size: 13px; }
            thead tr { border-top: 1px solid ${lineColor}; border-bottom: 1px solid ${lineColor}; }
            th, td { padding: 8px; text-align: left; white-space: normal; word-break: break-word; }
            tbody tr { border-bottom: 1px solid ${isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}; }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal No.</th>
                    <th>Check No.</th>
                    <th>Check Date</th>
                    <th>Payee</th>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th class="right">Debit</th>
                    <th class="right">Credit</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // --- R2A03 REAL DATA: dedicated filter card — Branch + Account From/To
  // + Journal Book (from m05.j_desc) + Entry Dates.
  function CheckByCheckNumberFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    branches,
    selectedBranch,
    onBranchChange,
    accounts,
    selectedAccountFrom,
    onAccountFromChange,
    selectedAccountTo,
    onAccountToChange,
    journalBooks,
    selectedJournalBook,
    onJournalBookChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    accounts: { value: string; label: string }[];
    selectedAccountFrom: string;
    onAccountFromChange: (v: string) => void;
    selectedAccountTo: string;
    onAccountToChange: (v: string) => void;
    journalBooks: { value: string; label: string }[];
    selectedJournalBook: string;
    onJournalBookChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Branch</label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Account From</label>
                    <Select value={selectedAccountFrom} onValueChange={onAccountFromChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Account To</label>
                    <Select value={selectedAccountTo} onValueChange={onAccountToChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Journal Book</label>
                    <Select value={selectedJournalBook} onValueChange={onJournalBookChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {journalBooks.map((j) => (
                          <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Entry Date From</label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) => onJournalFiltersChange({ ...journalFilters, dateFrom: e.target.value })}
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Entry Date To</label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) => onJournalFiltersChange({ ...journalFilters, dateTo: e.target.value })}
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>
                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R1A084 REAL DATA: dedicated filter card — Branch + Accounting Period
  // + Entry Dates. Similar to MismatchPeriodFilterCard but adds date range.
  function WithoutAccountLinkFilterCard({
    reportName,
    reportCode,
    journalFilters,
    onJournalFiltersChange,
    branches,
    selectedBranch,
    onBranchChange,
    periods,
    selectedPeriod,
    onPeriodChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    journalFilters: JournalFilters;
    onJournalFiltersChange: (f: JournalFilters) => void;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    periods: PeriodOption[];
    selectedPeriod: string;
    onPeriodChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Branch
                  </label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Accounting Period
                    </label>
                    <Select value={selectedPeriod} onValueChange={onPeriodChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date From
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateFrom}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateFrom: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Entry Date To
                      </label>
                      <Input
                        type="date"
                        value={journalFilters.dateTo}
                        onChange={(e) =>
                          onJournalFiltersChange({ ...journalFilters, dateTo: e.target.value })
                        }
                        className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading || !selectedPeriod}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- R1A083 REAL DATA: dedicated filter card — Branch + single Accounting
  // Period picker (from rssys.x03). No Entry Dates, no Account Title.
  function MismatchPeriodFilterCard({
    reportName,
    reportCode,
    branches,
    selectedBranch,
    onBranchChange,
    periods,
    selectedPeriod,
    onPeriodChange,
    onPreview,
    onClear,
    loading,
    error,
  }: {
    reportName: string;
    reportCode: string;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    periods: PeriodOption[];
    selectedPeriod: string;
    onPeriodChange: (v: string) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Branch
                  </label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Other Options
                </p>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Accounting Period
                    </label>
                    <Select value={selectedPeriod} onValueChange={onPeriodChange}>
                      <SelectTrigger className="h-9 border-[#d8dfea] bg-white text-sm dark:border-white/10 dark:bg-[#101d3d]">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {error && (
                    <p className="pt-1 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-2 xl:flex-col xl:items-stretch xl:justify-start">
              <Button
                type="button"
                onClick={onPreview}
                disabled={loading || !selectedPeriod}
                className="h-9 w-full bg-[#1570ef] text-sm text-white hover:bg-[#155fcb] disabled:opacity-60 dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button type="button" onClick={onClear} variant="outline" className={clearFieldsButtonClass + ' text-sm'}>
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Clear Fields
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  function SalesFilterCard({
    reportCode,
    onPreview,
    loading,
    error,
  }: {
    reportCode: string;
    onPreview: (
      branch: string,
      outlet: string,
      dateFrom: string,
      dateTo: string,
      viewAs: string,
      staffFrom?: string,
      staffTo?: string,
    ) => void;
    loading: boolean;
    error: string | null;
  }) {
    const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
    const [outlets, setOutlets] = useState<{ value: string; label: string }[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("");
    const [selectedOutlet, setSelectedOutlet] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>(formatLocalDate(new Date()));
    const [dateTo, setDateTo] = useState<string>(formatLocalDate(new Date()));
    const [viewAs, setViewAs] = useState<string>("all");

    // --- R4000 ONLY: Staff From/To. Real data from rssys.salesagent.
    const [staffList, setStaffList] = useState<{ value: string; label: string }[]>([]);
    const [staffFrom, setStaffFrom] = useState<string>("");
    const [staffTo, setStaffTo] = useState<string>("");
    const isStaffReport = reportCode === 'R4000';

    // --- R3000 ONLY: Item Group From/To. PLACEHOLDER options only
    // (FEEDS/FRY/PRODUCTS matches desktop screenshot) — no backend table
    // found yet for this list, and no filtering is wired to Preview.
    // TODO: find the real item-group source table and wire this for real.
    const itemGroupOptions = ['FEEDS', 'FRY', 'PRODUCTS'];
    const [itemGroupFrom, setItemGroupFrom] = useState<string>("");
    const [itemGroupTo, setItemGroupTo] = useState<string>("");
    const isItemGroupReport = reportCode === 'R3000';

    useEffect(() => {
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/branches/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setBranches(Array.isArray(result.branches) ? result.branches : []))
        .catch(() => setBranches([]));
    }, []);

    useEffect(() => {
      if (!selectedBranch) {
        setOutlets([]);
        setSelectedOutlet("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/sales/outlets/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => {
          const data = Array.isArray(result.outlets) ? result.outlets : [];
          setOutlets(data);
          if (data.length === 1) setSelectedOutlet(data[0].value);
          else setSelectedOutlet("");
        })
        .catch(() => setOutlets([]));
    }, [selectedBranch]);

    // --- R4000 ONLY: fetch real staff list, once, regardless of branch
    // (rssys.salesagent has no branch column, matches desktop behavior).
    useEffect(() => {
      if (!isStaffReport) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/sales/staff/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setStaffList(Array.isArray(result.staff) ? result.staff : []))
        .catch(() => setStaffList([]));
    }, [isStaffReport]);

    function handlePreview() {
      onPreview(selectedBranch, selectedOutlet, dateFrom, dateTo, viewAs, staffFrom, staffTo);
    }

    function handleClear() {
      setSelectedBranch("");
      setSelectedOutlet("");
      const today = formatLocalDate(new Date());
      setDateFrom(today);
      setDateTo(today);
      setViewAs("all");
      setStaffFrom("");
      setStaffTo("");
      setItemGroupFrom("");
      setItemGroupTo("");
    }

    return (
      <Card className="rounded-[32px] border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-5 sm:p-6 md:p-7">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-12">
            <div className="min-w-0 space-y-2 xl:col-span-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                By Branch
              </label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2 xl:col-span-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                Outlet
              </label>
              <Select
                value={selectedOutlet}
                onValueChange={setSelectedOutlet}
                disabled={!selectedBranch}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                  <SelectValue placeholder="Select outlet" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2 xl:col-span-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                Sales Date From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
              />
            </div>

            <div className="min-w-0 space-y-2 xl:col-span-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                Sales Date To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
              />
            </div>

            <div className="min-w-0 space-y-2 xl:col-span-3">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                View As
              </label>
              <Select value={viewAs} onValueChange={setViewAs}>
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                  <SelectValue placeholder="Select view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="journalized">Journalized Entries Only</SelectItem>
                  <SelectItem value="not_journalized">NOT Journalized Entries Only</SelectItem>
                  <SelectItem value="all">All Entries</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* --- R4000 ONLY: Staff From/To (real data, rssys.salesagent). */}
            {isStaffReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Staff From
                  </label>
                  <Select value={staffFrom} onValueChange={setStaffFrom}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.value} value={s.label}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Staff To
                  </label>
                  <Select value={staffTo} onValueChange={setStaffTo}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.value} value={s.label}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R3000 ONLY: Item Group From/To. PLACEHOLDER options,
                no backend filtering wired yet — see TODO above state decl. */}
            {isItemGroupReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Item Group From
                  </label>
                  <Select value={itemGroupFrom} onValueChange={setItemGroupFrom}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select item group" />
                    </SelectTrigger>
                    <SelectContent>
                      {itemGroupOptions.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-3">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Item Group To
                  </label>
                  <Select value={itemGroupTo} onValueChange={setItemGroupTo}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select item group" />
                    </SelectTrigger>
                    <SelectContent>
                      {itemGroupOptions.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {error && (
            <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              onClick={handlePreview}
              disabled={loading}
              className="h-11 w-full rounded-xl bg-[#1570ef] px-5 text-white hover:bg-[#155fcb] disabled:opacity-60 sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
            >
              <Eye className="mr-2 h-4 w-4" />
              {loading ? 'Loading...' : 'Preview'}
            </Button>

            <Button
              variant="outline"
              onClick={handleClear}
              className={`${clearFieldsButtonClass} rounded-xl sm:w-auto`}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Inventory Filter Card — shared by all 26 Inventory Reports.
  // Desktop confirms a much simpler layout than Sales: just By Branch +
  // Transaction Dates From/To. No Outlet/View As on this side.
  // ---------------------------------------------------------------------------

  function InventoryFilterCard({
    reportCode,
    onPreview,
    loading,
    error,
  }: {
    reportCode: string;
    onPreview: (
      reportCode: string,
      branch: string,
      dateFrom: string,
      dateTo: string,
      prFrom?: string,
      prTo?: string,
      itemCode?: string,
      supplier?: string,
      rrFrom?: string,
      rrTo?: string,
      cntFrom?: string,
      cntTo?: string,
      warehouse?: string,
      itemGrp?: string,
      asOf?: string,
      negativeOnly?: boolean,
      zeroCostOnly?: boolean,
    ) => void;
    loading: boolean;
    error: string | null;
  }) {
    const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
    const [selectedBranch, setSelectedBranch] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>(formatLocalDate(new Date()));
    const [dateTo, setDateTo] = useState<string>(formatLocalDate(new Date()));

    // --- R1I02 ONLY: PR Number From/To. Real data from rssys.prhdr,
    // label format "pr_code - reference - pr_date" confirmed via desktop
    // screenshot (I012). Both From and To share the same option list.
    const [prNumbers, setPrNumbers] = useState<{ value: string; label: string }[]>([]);
    const [prFrom, setPrFrom] = useState<string>("");
    const [prTo, setPrTo] = useState<string>("");
    const isPrNumberReport = reportCode === 'R1I02';

    // --- R4I02 ONLY: Direct Purchase Number From/To. Separate dropdown
    // source (rssys.pinvhd via report_direct_purchase_numbers) but
    // reuses the same prFrom/prTo state as R1I02's PR Number fields —
    // same "range" shape, just a different source list and label.
    // pinvhd is currently EMPTY in live_easyeats, so this list will be
    // empty until real Direct Purchase transactions exist.
    const [directPurchaseNumbers, setDirectPurchaseNumbers] = useState<{ value: string; label: string }[]>([]);
    const isDirectPurchaseNumberReport = reportCode === 'R4I02';

    // --- R5I02 ONLY: Issuance Number From/To. Separate dropdown source
    // (rssys.stkcrd via report_stock_issuance_numbers, filtered to
    // trn_type='I') but reuses the same prFrom/prTo state as
    // R1I02/R4I02 — same "range" shape, just a different source list
    // and label. UNVERIFIED — stkcrd has zero 'I' rows in either
    // tenant, so this list will be empty until real Stock Issuance
    // transactions exist.
    const [issuanceNumbers, setIssuanceNumbers] = useState<{ value: string; label: string }[]>([]);
    const isStockIssuanceNumberReport = reportCode === 'R5I02';

    // --- R6I02 ONLY: Transfer Number From/To. FREE-TEXT, not a
    // dropdown — the desktop combo box showed a single static,
    // unrelated value ("FG CAN GOODS") instead of real transfer
    // numbers. rssys.whouse, rssys.itmwhs, and rssys.itmgrp were all
    // checked and ruled out; rssys.rmtransfer (the only table with a
    // real transfer-number field) is completely empty. Text entered
    // here is matched directly against stkcrd.reference on the
    // backend — reuses the same prFrom/prTo state as the other range
    // filters, just rendered as text inputs instead of Selects.
    const isStockTransferNumberReport = reportCode === 'R6I02';

    // --- R7I02 ONLY: Adjustment Number From/To. FREE-TEXT, not a
    // dropdown — same reasoning as Transfer Number (R6I02) above. The
    // desktop combo box for this field showed a single static,
    // unrelated value ("BEGINNING BALANCE") that matches no real row
    // in stkcrd (confirmed: all 3 real Adjustment rows share reference
    // 'A#S7000003'). Reuses the same prFrom/prTo state, rendered as
    // text inputs.
    const isStockAdjustmentNumberReport = reportCode === 'R7I02';

    // --- R1I03 / R2I04 / R3I03 / R4I04 / R5I03 / R6I03: single Items
    // dropdown. Real data from rssys.items (active='T'), value is
    // item_code (never item_desc — descriptions are inconsistently
    // formatted). Confirmed via desktop screenshots (I013/I024) as a
    // single-select, not multi. All six report codes share the same
    // rssys.items source/endpoint.
    const [items, setItems] = useState<{ value: string; label: string }[]>([]);
    const [selectedItem, setSelectedItem] = useState<string>("");
    const isItemsReport = reportCode === 'R1I03' || reportCode === 'R2I04' || reportCode === 'R3I03' || reportCode === 'R4I04' || reportCode === 'R5I03' || reportCode === 'R6I03' || reportCode === 'R7I03';

    // --- R2I03 / R4I03: single Supplier dropdown. Reuses the existing
    // report_suppliers endpoint (rssys.m07, type='Supplier') — confirmed
    // via pgAdmin this is the exact same alphabetized list shown on the
    // desktop I023 dropdown, not branch-scoped (m07.branch is NULL for
    // every supplier row on this tenant).
    const [suppliers, setSuppliers] = useState<{ value: string; label: string }[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<string>("");
    const isSupplierReport = reportCode === 'R2I03' || reportCode === 'R4I03';

    // --- R3I02 ONLY: RR Number From/To. Real data from rssys.rechdr,
    // label is JUST _reference (e.g. "SI#:1235") — confirmed via desktop
    // screenshot (I032), unlike PR Number's "code - ref - date" format.
    const [rrNumbers, setRrNumbers] = useState<{ value: string; label: string }[]>([]);
    const [rrFrom, setRrFrom] = useState<string>("");
    const [rrTo, setRrTo] = useState<string>("");
    const isRrNumberReport = reportCode === 'R3I02';

    // --- R5I04 ONLY: Cost Center From/To. Real column on rssys.stkcrd
    // (cnt_code), labels joined to rssys.branch — UNVERIFIED beyond one
    // sample row ("000" -> HEAD OFFICE). List will be empty until real
    // Stock Issuance transactions exist (same caveat as Issuance
    // Numbers above).
    const [costCenters, setCostCenters] = useState<{ value: string; label: string }[]>([]);
    const [cntFrom, setCntFrom] = useState<string>("");
    const [cntTo, setCntTo] = useState<string>("");
    const isCostCenterReport = reportCode === 'R5I04';

    // --- R9I00 / R10I00 / R11I00 ONLY: "Other Inventory Reports"
    // filters. Warehouse (rssys.whouse) and Item Group (rssys.itmgrp)
    // dropdowns are CONFIRMED real sources — matched the desktop
    // dropdowns exactly. R10I00 uses a single "As Of" date instead of
    // the base Dates From/To pair (point-in-time valuation snapshot).
    // R9I00 has two extra checkboxes matching the desktop screen.
    const [warehouses, setWarehouses] = useState<{ value: string; label: string }[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
    const [itemGroups, setItemGroups] = useState<{ value: string; label: string }[]>([]);
    const [selectedItemGroup, setSelectedItemGroup] = useState<string>("");
    const [asOfDate, setAsOfDate] = useState<string>(formatLocalDate(new Date()));
    const [negativeOnly, setNegativeOnly] = useState<boolean>(false);
    const [zeroCostOnly, setZeroCostOnly] = useState<boolean>(false);
    const isWarehouseReport = reportCode === 'R9I00' || reportCode === 'R10I00';
    const isItemGroupReport = reportCode === 'R9I00' || reportCode === 'R10I00' || reportCode === 'R11I00';
    const isValuationReport = reportCode === 'R10I00';
    const isSummaryByDateReport = reportCode === 'R9I00';

    useEffect(() => {
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/branches/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setBranches(Array.isArray(result.branches) ? result.branches : []))
        .catch(() => setBranches([]));
    }, []);

    // --- R1I02 ONLY: fetch PR Number list once Branch is selected.
    useEffect(() => {
      if (!isPrNumberReport) return;
      if (!selectedBranch) {
        setPrNumbers([]);
        setPrFrom("");
        setPrTo("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/purchase-requests/numbers/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setPrNumbers(Array.isArray(result.pr_numbers) ? result.pr_numbers : []))
        .catch(() => setPrNumbers([]));
    }, [isPrNumberReport, selectedBranch]);

    // --- R4I02 ONLY: fetch Direct Purchase Number list once Branch is
    // selected. Separate endpoint (rssys.pinvhd), reuses prFrom/prTo
    // state for the selected values.
    useEffect(() => {
      if (!isDirectPurchaseNumberReport) return;
      if (!selectedBranch) {
        setDirectPurchaseNumbers([]);
        setPrFrom("");
        setPrTo("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/direct-purchases/numbers/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setDirectPurchaseNumbers(Array.isArray(result.purchase_numbers) ? result.purchase_numbers : []))
        .catch(() => setDirectPurchaseNumbers([]));
    }, [isDirectPurchaseNumberReport, selectedBranch]);

    // --- R5I02 ONLY: fetch Issuance Number list once Branch is
    // selected. Separate endpoint (rssys.stkcrd), reuses prFrom/prTo
    // state for the selected values.
    useEffect(() => {
      if (!isStockIssuanceNumberReport) return;
      if (!selectedBranch) {
        setIssuanceNumbers([]);
        setPrFrom("");
        setPrTo("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/stock-issuance/numbers/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setIssuanceNumbers(Array.isArray(result.issuance_numbers) ? result.issuance_numbers : []))
        .catch(() => setIssuanceNumbers([]));
    }, [isStockIssuanceNumberReport, selectedBranch]);

    // --- R6I02 ONLY: clear Transfer Number text fields if Branch is
    // cleared. No fetch here — this is free text, not a dropdown (see
    // state declaration above for why).
    useEffect(() => {
      if (!isStockTransferNumberReport) return;
      if (!selectedBranch) {
        setPrFrom("");
        setPrTo("");
      }
    }, [isStockTransferNumberReport, selectedBranch]);

    // --- R7I02 ONLY: clear Adjustment Number text fields if Branch is
    // cleared. No fetch here — this is free text, not a dropdown (see
    // state declaration above for why).
    useEffect(() => {
      if (!isStockAdjustmentNumberReport) return;
      if (!selectedBranch) {
        setPrFrom("");
        setPrTo("");
      }
    }, [isStockAdjustmentNumberReport, selectedBranch]);

    // --- R1I03 / R2I04: fetch Items list once Branch is selected.
    useEffect(() => {
      if (!isItemsReport) return;
      if (!selectedBranch) {
        setItems([]);
        setSelectedItem("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/purchase-requests/items/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setItems(Array.isArray(result.items) ? result.items : []))
        .catch(() => setItems([]));
    }, [isItemsReport, selectedBranch]);

    // --- R2I03 ONLY: fetch Supplier list once (not branch-dependent —
    // rssys.m07 has no meaningful branch scoping for this tenant).
    useEffect(() => {
      if (!isSupplierReport) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/suppliers/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setSuppliers(Array.isArray(result.suppliers) ? result.suppliers : []))
        .catch(() => setSuppliers([]));
    }, [isSupplierReport]);

    // --- R3I02 ONLY: fetch RR Number list once Branch is selected.
    useEffect(() => {
      if (!isRrNumberReport) return;
      if (!selectedBranch) {
        setRrNumbers([]);
        setRrFrom("");
        setRrTo("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/receiving/numbers/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setRrNumbers(Array.isArray(result.rr_numbers) ? result.rr_numbers : []))
        .catch(() => setRrNumbers([]));
    }, [isRrNumberReport, selectedBranch]);

    // --- R5I04 ONLY: fetch Cost Center list once Branch is selected.
    useEffect(() => {
      if (!isCostCenterReport) return;
      if (!selectedBranch) {
        setCostCenters([]);
        setCntFrom("");
        setCntTo("");
        return;
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/stock-issuance/cost-centers/?branch=${selectedBranch}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setCostCenters(Array.isArray(result.cost_centers) ? result.cost_centers : []))
        .catch(() => setCostCenters([]));
    }, [isCostCenterReport, selectedBranch]);

    // --- R9I00 / R10I00 ONLY: fetch Warehouse list once (not
    // branch-dependent — rssys.whouse only has 2 global rows).
    useEffect(() => {
      if (!isWarehouseReport) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/warehouses/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setWarehouses(Array.isArray(result.warehouses) ? result.warehouses : []))
        .catch(() => setWarehouses([]));
    }, [isWarehouseReport]);

    // --- R9I00 / R10I00 / R11I00 ONLY: fetch Item Group list once (not
    // branch-dependent — see reports.py module docstring re: itmgrp's
    // branch mismatch).
    useEffect(() => {
      if (!isItemGroupReport) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
      const tenant = typeof window !== 'undefined' ? localStorage.getItem('raiports-tenant') : null;
      fetch(`${API_URL}/approval/reports/item-groups/`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(tenant ? { 'X-Tenant': tenant } : {}),
        },
      })
        .then((r) => r.json())
        .then((result) => setItemGroups(Array.isArray(result.item_groups) ? result.item_groups : []))
        .catch(() => setItemGroups([]));
    }, [isItemGroupReport]);

    function handlePreview() {
      onPreview(reportCode, selectedBranch, dateFrom, dateTo, prFrom, prTo, selectedItem, selectedSupplier, rrFrom, rrTo, cntFrom, cntTo, selectedWarehouse, selectedItemGroup, asOfDate, negativeOnly, zeroCostOnly);
    }

    function handleClear() {
      setSelectedBranch("");
      const today = formatLocalDate(new Date());
      setDateFrom(today);
      setDateTo(today);
      setPrFrom("");
      setPrTo("");
      setSelectedItem("");
      setSelectedSupplier("");
      setRrFrom("");
      setRrTo("");
      setCntFrom("");
      setCntTo("");
      setSelectedWarehouse("");
      setSelectedItemGroup("");
      setAsOfDate(today);
      setNegativeOnly(false);
      setZeroCostOnly(false);
    }

    return (
      <Card className="rounded-[32px] border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-5 sm:p-6 md:p-7">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-12">
            <div className="min-w-0 space-y-2 xl:col-span-4">
              <label className="text-sm font-semibold text-slate-700 dark:text-white">
                By Branch
              </label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* --- R10I00 ONLY: single "As Of" date replaces the base
                Transaction Dates From/To pair — Inventory Valuation is a
                point-in-time snapshot, not a period range. Computed from
                rssys.stkcrd (SUM(qty_in)-SUM(qty_out) as of this date),
                not items.qty_onhand — see reports.py module docstring. */}
            {isValuationReport ? (
              <div className="min-w-0 space-y-2 xl:col-span-4">
                <label className="text-sm font-semibold text-slate-700 dark:text-white">
                  As Of
                </label>
                <Input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                />
              </div>
            ) : (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-4">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Transaction Dates From
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-4">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Transaction Dates To
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>
              </>
            )}

            {/* --- R1I02 ONLY: Purchase Request Number From/To (real data, rssys.prhdr). */}
            {isPrNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Purchase Request Number From
                  </label>
                  <Select value={prFrom} onValueChange={setPrFrom} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select PR number" />
                    </SelectTrigger>
                    <SelectContent>
                      {prNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Purchase Request Number To
                  </label>
                  <Select value={prTo} onValueChange={setPrTo} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select PR number" />
                    </SelectTrigger>
                    <SelectContent>
                      {prNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R4I02 ONLY: Direct Purchase Number From/To (real data, rssys.pinvhd). */}
            {isDirectPurchaseNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Direct Purchase Number From
                  </label>
                  <Select value={prFrom} onValueChange={setPrFrom} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select purchase number" />
                    </SelectTrigger>
                    <SelectContent>
                      {directPurchaseNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Direct Purchase Number To
                  </label>
                  <Select value={prTo} onValueChange={setPrTo} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select purchase number" />
                    </SelectTrigger>
                    <SelectContent>
                      {directPurchaseNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R5I02 ONLY: Issuance Number From/To (real data, rssys.stkcrd, trn_type='I' — UNVERIFIED, no real rows exist). */}
            {isStockIssuanceNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Issuance Number From
                  </label>
                  <Select value={prFrom} onValueChange={setPrFrom} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select issuance number" />
                    </SelectTrigger>
                    <SelectContent>
                      {issuanceNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Issuance Number To
                  </label>
                  <Select value={prTo} onValueChange={setPrTo} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select issuance number" />
                    </SelectTrigger>
                    <SelectContent>
                      {issuanceNumbers.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R6I02 ONLY: Transfer Number From/To. FREE-TEXT inputs,
                not a dropdown — the desktop combo box for this field
                showed a single static, unrelated value ("FG CAN GOODS")
                instead of real transfer numbers, and rssys.rmtransfer
                (the only table with a real transfer-number field) is
                completely empty. Text entered here is matched directly
                against stkcrd.reference on the backend (e.g. "T#S8000001"). */}
            {isStockTransferNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Transfer Number From
                  </label>
                  <Input
                    type="text"
                    value={prFrom}
                    onChange={(e) => setPrFrom(e.target.value)}
                    placeholder="e.g. T#S8000001"
                    disabled={!selectedBranch}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Transfer Number To
                  </label>
                  <Input
                    type="text"
                    value={prTo}
                    onChange={(e) => setPrTo(e.target.value)}
                    placeholder="e.g. T#S8000001"
                    disabled={!selectedBranch}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>
              </>
            )}

            {/* --- R7I02 ONLY: Adjustment Number From/To. FREE-TEXT inputs,
                not a dropdown — the desktop combo box for this field
                showed a single static, unrelated value ("BEGINNING
                BALANCE") that matches no real row in stkcrd (all 3 real
                Adjustment rows share reference "A#S7000003"). Text
                entered here is matched directly against stkcrd.reference
                on the backend. */}
            {isStockAdjustmentNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Adjustment Number From
                  </label>
                  <Input
                    type="text"
                    value={prFrom}
                    onChange={(e) => setPrFrom(e.target.value)}
                    placeholder="e.g. A#S7000003"
                    disabled={!selectedBranch}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Adjustment Number To
                  </label>
                  <Input
                    type="text"
                    value={prTo}
                    onChange={(e) => setPrTo(e.target.value)}
                    placeholder="e.g. A#S7000003"
                    disabled={!selectedBranch}
                    className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>
              </>
            )}

            {/* --- R1I03 / R2I04 / R3I03 / R4I04: single Items dropdown (real data, rssys.items). */}
            {isItemsReport && (
              <div className="min-w-0 space-y-2 xl:col-span-8">
                <label className="text-sm font-semibold text-slate-700 dark:text-white">
                  Items
                </label>
                <Select value={selectedItem} onValueChange={setSelectedItem} disabled={!selectedBranch}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* --- R2I03 ONLY: single Supplier dropdown (real data, rssys.m07). */}
            {isSupplierReport && (
              <div className="min-w-0 space-y-2 xl:col-span-8">
                <label className="text-sm font-semibold text-slate-700 dark:text-white">
                  Select Supplier
                </label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* --- R3I02 ONLY: RR Number From/To (real data, rssys.rechdr). */}
            {isRrNumberReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    RR Number From
                  </label>
                  <Select value={rrFrom} onValueChange={setRrFrom} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select RR number" />
                    </SelectTrigger>
                    <SelectContent>
                      {rrNumbers.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    RR Number To
                  </label>
                  <Select value={rrTo} onValueChange={setRrTo} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select RR number" />
                    </SelectTrigger>
                    <SelectContent>
                      {rrNumbers.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R5I04 ONLY: Cost Center From/To (real data, rssys.stkcrd.cnt_code — UNVERIFIED, no real rows exist). */}
            {isCostCenterReport && (
              <>
                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Cost Center From
                  </label>
                  <Select value={cntFrom} onValueChange={setCntFrom} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select cost center" />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 space-y-2 xl:col-span-6">
                  <label className="text-sm font-semibold text-slate-700 dark:text-white">
                    Cost Center To
                  </label>
                  <Select value={cntTo} onValueChange={setCntTo} disabled={!selectedBranch}>
                    <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select cost center" />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* --- R9I00 / R10I00 ONLY: optional Warehouse dropdown
                (rssys.whouse, CONFIRMED — matches the desktop dropdown
                exactly: HEAD OFFICE / WAREHOUSE CABANCALAN). Not branch-
                dependent, not required (no "All" default needed since
                leaving it blank simply omits the filter). */}
            {isWarehouseReport && (
              <div className="min-w-0 space-y-2 xl:col-span-6">
                <label className="text-sm font-semibold text-slate-700 dark:text-white">
                  Warehouse
                </label>
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                    <SelectValue placeholder="All warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.value} value={w.value}>
                        {w.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* --- R9I00 / R10I00 / R11I00 ONLY: optional Item Group /
                Category dropdown (rssys.itmgrp, CONFIRMED — matches the
                desktop dropdown exactly). Not required. NOTE: this also
                identifies the real source table for R3O00's Item Group
                placeholder elsewhere in this file — not wired there yet,
                separate follow-up task. */}
            {isItemGroupReport && (
              <div className="min-w-0 space-y-2 xl:col-span-6">
                <label className="text-sm font-semibold text-slate-700 dark:text-white">
                  Item Group
                </label>
                <Select value={selectedItemGroup} onValueChange={setSelectedItemGroup}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                    <SelectValue placeholder="All item groups" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemGroups.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* --- R9I00 ONLY: the two desktop checkboxes. Every item in
                live_easyeats currently has cost_pric=0, so "Display Zero
                Cost Price Only" will match everything until real cost
                data exists — see reports.py module docstring. */}
            {isSummaryByDateReport && (
              <div className="min-w-0 space-y-3 xl:col-span-12 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-white">
                  <input
                    type="checkbox"
                    checked={negativeOnly}
                    onChange={(e) => setNegativeOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d8dfea]"
                  />
                  Display Negative Count Only
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-white">
                  <input
                    type="checkbox"
                    checked={zeroCostOnly}
                    onChange={(e) => setZeroCostOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d8dfea]"
                  />
                  Display Zero Cost Price Only
                </label>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              onClick={handlePreview}
              disabled={loading}
              className="h-11 w-full rounded-xl bg-[#1570ef] px-5 text-white hover:bg-[#155fcb] disabled:opacity-60 sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
            >
              <Eye className="mr-2 h-4 w-4" />
              {loading ? 'Loading...' : 'Preview'}
            </Button>

            <Button
              variant="outline"
              onClick={handleClear}
              className={`${clearFieldsButtonClass} rounded-xl sm:w-auto`}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Subledger Filter Card — R4A02, R4A03, R4A05, R4A06
  // Filters: Branch + Account ID (sl='Y') + As Of date +
  //          Customer/Supplier From/To + optional Summary Only checkbox
  // ---------------------------------------------------------------------------

  function SubledgerFilterCard({
    reportName,
    reportCode,
    branches,
    selectedBranch,
    onBranchChange,
    accounts,
    selectedAccount,
    onAccountChange,
    slNames,
    selectedSlNameFrom,
    onSlNameFromChange,
    selectedSlNameTo,
    onSlNameToChange,
    asOf,
    onAsOfChange,
    showSummaryOnly,
    summaryOnly,
    onSummaryOnlyChange,
    showUnposted,
    showPosted,
    onShowUnpostedChange,
    onShowPostedChange,
    onPreview,
    onClear,
    loading,
    error,
    slFromLabel,
    slToLabel,
  }: {
    reportName: string;
    reportCode: string;
    branches: { value: string; label: string }[];
    selectedBranch: string;
    onBranchChange: (v: string) => void;
    accounts: { value: string; label: string }[];
    selectedAccount: string;
    onAccountChange: (v: string) => void;
    slNames: { value: string; label: string }[];
    selectedSlNameFrom: string;
    onSlNameFromChange: (v: string) => void;
    selectedSlNameTo: string;
    onSlNameToChange: (v: string) => void;
    asOf: string;
    onAsOfChange: (v: string) => void;
    showSummaryOnly: boolean;
    summaryOnly: boolean;
    onSummaryOnlyChange: (v: boolean) => void;
    showUnposted: boolean;
    onShowUnpostedChange: (v: boolean) => void;
    showPosted: boolean;
    onShowPostedChange: (v: boolean) => void;
    onPreview: () => void;
    onClear: () => void;
    loading: boolean;
    error: string | null;
    slFromLabel: string;
    slToLabel: string;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {reportName}
            </h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {reportCode}
            </span>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* BY BRANCH */}
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  By Branch
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Branch</label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Account ID</label>
                  <Select value={selectedAccount} onValueChange={onAccountChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ENTRY DETAILS */}
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Entry Details
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">As Of</label>
                  <input
                    type="date"
                    value={asOf}
                    onChange={(e) => onAsOfChange(e.target.value)}
                    className="h-9 w-full rounded-xl border border-[#d8dfea] bg-white px-3 text-sm text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
                  />
                </div>
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{slFromLabel}</label>
                  <Select value={selectedSlNameFrom} onValueChange={onSlNameFromChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {slNames.map((n) => (
                        <SelectItem key={n.value || n.label} value={n.label}>{n.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">{slToLabel}</label>
                  <Select value={selectedSlNameTo} onValueChange={onSlNameToChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {slNames.map((n) => (
                        <SelectItem key={n.value || n.label} value={n.label}>{n.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={showUnposted}
                      onChange={(e) => onShowUnpostedChange(e.target.checked)}
                      className="accent-[#1570ef]"
                    />
                    Unposted Entries
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={showPosted}
                      onChange={(e) => onShowPostedChange(e.target.checked)}
                      className="accent-[#1570ef]"
                    />
                    Posted Entries
                  </label>
                  {showSummaryOnly && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={summaryOnly}
                        onChange={(e) => onSummaryOnlyChange(e.target.checked)}
                        className="accent-[#1570ef]"
                      />
                      Summary Only
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* BUTTONS */}
            <div className="flex flex-row gap-2 xl:flex-col xl:justify-start xl:pt-[28px]">
              <Button
                onClick={onPreview}
                disabled={loading}
                className="h-9 flex-1 rounded-xl bg-[#1570ef] px-4 text-sm text-white hover:bg-[#155fcb] xl:flex-none dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-4 w-4" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button
                variant="outline"
                onClick={onClear}
                className={`${clearFieldsButtonClass} h-9 flex-1 rounded-xl xl:flex-none`}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear Fields
              </Button>
            </div>
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Financial Statement Filter Card — R5A01–R5A11
  // ---------------------------------------------------------------------------

  function FinancialStatementFilterCard({
    reportName, reportCode, branches, selectedBranch, onBranchChange,
    periods, selectedPeriodFrom, onPeriodFromChange, selectedPeriodTo, onPeriodToChange,
    years, selectedYear, onYearChange, viewAs, onViewAsChange,
    showYearToDate, yearToDate, onYearToDateChange,
    showCompareBudget, compareBudget, onCompareBudgetChange,
    isYearReport, onPreview, onClear, loading, error,
  }: {
    reportName: string; reportCode: string;
    branches: { value: string; label: string }[];
    selectedBranch: string; onBranchChange: (v: string) => void;
    periods: PeriodOption[];
    selectedPeriodFrom: string; onPeriodFromChange: (v: string) => void;
    selectedPeriodTo: string; onPeriodToChange: (v: string) => void;
    years: { value: string; label: string }[];
    selectedYear: string; onYearChange: (v: string) => void;
    viewAs: string; onViewAsChange: (v: string) => void;
    showYearToDate: boolean; yearToDate: boolean; onYearToDateChange: (v: boolean) => void;
    showCompareBudget: boolean; compareBudget: boolean; onCompareBudgetChange: (v: boolean) => void;
    isYearReport: boolean;
    onPreview: () => void; onClear: () => void;
    loading: boolean; error: string | null;
  }) {
    return (
      <Card className="rounded-2xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">{reportName}</h3>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">{reportCode}</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* BY BRANCH */}
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">By Branch</p>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Branch</label>
                  <Select value={selectedBranch} onValueChange={onBranchChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* SELECT PERIOD */}
              <div className="rounded-xl bg-white/70 p-3 dark:bg-white/[0.04]">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Select Period</p>
                {isYearReport ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Financial Year</label>
                    <Select value={selectedYear} onValueChange={onYearChange}>
                      <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Period From</label>
                      <Select value={selectedPeriodFrom} onValueChange={onPeriodFromChange}>
                        <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-2 space-y-2">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">To</label>
                      <Select value={selectedPeriodTo} onValueChange={onPeriodToChange}>
                        <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          {periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="mt-2 space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">View As</label>
                  <Select value={viewAs} onValueChange={onViewAsChange}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="posted">Posted Entries Only</SelectItem>
                      <SelectItem value="unposted">Unposted Entries Only</SelectItem>
                      <SelectItem value="both">Posted and Unposted Entries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {showYearToDate && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={yearToDate} onChange={(e) => onYearToDateChange(e.target.checked)} className="accent-[#1570ef]" />
                      Year-to-Date
                    </label>
                  )}
                  {showCompareBudget && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={compareBudget} onChange={(e) => onCompareBudgetChange(e.target.checked)} className="accent-[#1570ef]" />
                      Compare against budget
                    </label>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-row gap-2 xl:flex-col xl:justify-start xl:pt-[28px]">
              <Button onClick={onPreview} disabled={loading}
                className="h-9 flex-1 rounded-xl bg-[#1570ef] px-4 text-sm text-white hover:bg-[#155fcb] xl:flex-none dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
                <Eye className="mr-2 h-4 w-4" />
                {loading ? 'Loading...' : 'Preview'}
              </Button>
              <Button variant="outline" onClick={onClear}
                className={`${clearFieldsButtonClass} h-9 flex-1 rounded-xl xl:flex-none`}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear Fields
              </Button>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // Preview HTML + export logic (ported from CategoryPanel.tsx)
  // ---------------------------------------------------------------------------

  function getPreviewHtml({
    categoryKey: _categoryKey,
    reportCode,
    reportName,
    sectionLabel,
    isDark,
    journalEntries,
    accountActivityRows,
    unpostedRows,
    cashPositionRows,
    a104Rows,
    a105Rows,
    a106Rows,
    a061Rows,
    a107Rows,
    a081Rows,
    a082Rows,
    a083Rows,
    a084Rows,
    a085Rows,
    r2a01Rows,
    r2a02Rows,
    r2a03Rows,
    r3a01Rows,
    r3a02Rows,
    r3a03Rows,
    r3a04Rows,
    r4a02Rows,
    r4a03Rows,
    r4a05Rows,
    r4a06Rows,
    financialRows,
    salesRows,
    inventoryRows,
    companyInfo,
    companyBranchLabel,
  }: {
    categoryKey: string; reportCode: string; reportName: string; sectionLabel: string; isDark: boolean;
    journalEntries: JournalEntryRow[]; accountActivityRows: AccountActivityRow[];
    unpostedRows: UnpostedEntryRow[]; cashPositionRows: CashPositionRow[];
    a104Rows: UnpostedEntryRow[]; a105Rows: AccountActivityRow[]; a106Rows: AccountActivityRow[];
    a061Rows: AccountActivityRow[]; a107Rows: AccountActivityRow[];
    a081Rows: UnbalanceJournalRow[]; a082Rows: UnbalanceJournalRow[]; a083Rows: UnbalanceJournalRow[];
    a084Rows: UnbalanceJournalRow[]; a085Rows: UnbalanceJournalRow[];
    r2a01Rows: CheckEntryRow[]; r2a02Rows: CheckEntryRow[]; r2a03Rows: CheckEntryRow[];
    r3a01Rows: AccountActivityRow[]; r3a02Rows: AccountActivityRow[];
    r3a03Rows: AccountActivityRow[]; r3a04Rows: GLSummaryRow[];
    r4a02Rows: AccountActivityRow[]; r4a03Rows: AccountActivityRow[];
    r4a05Rows: AccountActivityRow[]; r4a06Rows: AccountActivityRow[];
    financialRows: FinancialStatementRow[];
    salesRows: SalesRow[];
    inventoryRows: InventoryRow[];
    companyInfo: CompanyInfo | null;
    companyBranchLabel: string;
  }) {
    // --- SALES REAL DATA: OTC Sales Report (R1000/R1S00/R2000/R2S00).
    if (isSalesReport(reportCode)) {
      return buildSalesPreviewHtml(reportName, sectionLabel, isDark, salesRows, companyInfo, companyBranchLabel);
    }
    // --- INVENTORY REAL DATA: all 26 Inventory Report codes.
    if (isInventoryReport(reportCode)) {
      return buildInventoryPreviewHtml(reportName, sectionLabel, isDark, inventoryRows, companyInfo, companyBranchLabel);
    }
    if (isJournalReportCode(reportCode)) {
      return buildJournalEntriesPreviewHtml(reportName, sectionLabel, isDark, journalEntries, companyInfo, companyBranchLabel);
    }
    // --- R1A01 REAL DATA: renders real rows instead of the static "No
    // records available" placeholder.
    if (isAccountActivityReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, accountActivityRows, companyInfo, companyBranchLabel);
    }
    // --- R1A02 REAL DATA: same idea, its own dedicated column layout.
    if (isListUnpostedReportCode(reportCode)) {
      return buildUnpostedEntriesPreviewHtml(reportName, sectionLabel, isDark, unpostedRows, companyInfo, companyBranchLabel);
    }
    // --- R1A03 REAL DATA: same shape as Account Activity, so reuses the
    // same accounting preview builder, just fed cashPositionRows instead.
    if (isCashPositionReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, cashPositionRows, companyInfo, companyBranchLabel);
    }
    // --- R1A05 REAL DATA: same shape as R1A01 account activity.
    if (isAccountMovementSummaryReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, a105Rows, companyInfo, companyBranchLabel);
    }
    // --- R1A06 REAL DATA: same shape as R1A01.
    if (isSummaryInputTaxReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, a106Rows, companyInfo, companyBranchLabel);
    }
    if (isSummaryOutputTaxReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, a061Rows, companyInfo, companyBranchLabel);
    }
    if (isSummaryStatementAccountsReportCode(reportCode)) {
      // FIX: R1A07 has no Branch filter (genuinely company-wide, confirmed
      // by the absence of a Branch dropdown on this report's filter card).
      // Its loader (loadSummaryStatementOfAccounts) correctly never calls
      // loadCompanyInfoIfNeeded/setActiveBranchLabel, since there's no
      // branch context to load. But that meant the printed header was
      // silently reusing whatever companyBranchLabel was left over from
      // the last report actually viewed (e.g. "MANDAUE BRANCH"), which is
      // misleading for a report that spans all branches. Overriding the
      // branch label to "All Branches" here instead — company name is
      // still safe to reuse from shared state since it doesn't vary by
      // branch within one tenant.
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, a107Rows, companyInfo, 'All Branches');
    }
    if (isUnbalanceJournalListReportCode(reportCode)) {
      return buildUnbalanceJournalPreviewHtml(reportName, sectionLabel, isDark, a081Rows, companyInfo, companyBranchLabel);
    }
    if (isSubsidiaryWithoutSubsidiaryReportCode(reportCode)) {
      return buildUnbalanceJournalPreviewHtml(reportName, sectionLabel, isDark, a082Rows, companyInfo, companyBranchLabel);
    }
    if (isMismatchAccountingPeriodReportCode(reportCode)) {
      return buildUnbalanceJournalPreviewHtml(reportName, sectionLabel, isDark, a083Rows, companyInfo, companyBranchLabel);
    }
    if (isWithoutAccountLinkReportCode(reportCode)) {
      return buildUnbalanceJournalPreviewHtml(reportName, sectionLabel, isDark, a084Rows, companyInfo, companyBranchLabel);
    }
    if (isSubsidiaryDiffAccountLinkReportCode(reportCode)) {
      return buildUnbalanceJournalPreviewHtml(reportName, sectionLabel, isDark, a085Rows, companyInfo, companyBranchLabel);
    }
    if (isCheckByEntryDateReportCode(reportCode)) {
      return buildCheckByEntryDatePreviewHtml(reportName, sectionLabel, isDark, r2a01Rows, companyInfo, companyBranchLabel);
    }
    if (isCheckByCheckDateReportCode(reportCode)) {
      return buildCheckByEntryDatePreviewHtml(reportName, sectionLabel, isDark, r2a02Rows, companyInfo, companyBranchLabel);
    }
    if (isCheckByCheckNumberReportCode(reportCode)) {
      return buildCheckByEntryDatePreviewHtml(reportName, sectionLabel, isDark, r2a03Rows, companyInfo, companyBranchLabel);
    }
    if (isGeneralJournalReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r3a01Rows, companyInfo, companyBranchLabel);
    }
    if (isGLActivityByAccountIDReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r3a02Rows, companyInfo, companyBranchLabel);
    }
    if (isGLByJournalIDReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r3a03Rows, companyInfo, companyBranchLabel);
    }
    if (isGLSummaryByAccountIDReportCode(reportCode)) {
      return buildGLSummaryPreviewHtml(reportName, sectionLabel, isDark, r3a04Rows, companyInfo, companyBranchLabel);
    }
    if (isBalancesFromCustomerReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r4a02Rows, companyInfo, companyBranchLabel);
    }
    if (isCustomersAgingReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r4a03Rows, companyInfo, companyBranchLabel);
    }
    if (isBalancesToSupplierReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r4a05Rows, companyInfo, companyBranchLabel);
    }
    if (isSuppliersAgingReportCode(reportCode)) {
      return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, r4a06Rows, companyInfo, companyBranchLabel);
    }
    if (isFinancialStatementReportCode(reportCode)) {
      return buildFinancialPreviewHtml(reportName, sectionLabel, isDark, financialRows, companyInfo, companyBranchLabel);
    }
    // --- R1A04 REAL DATA: same output shape as R1A02 unposted entries.
    if (isUnpostedEntriesA104ReportCode(reportCode)) {
      return buildUnpostedEntriesPreviewHtml(reportName, sectionLabel, isDark, a104Rows, companyInfo, companyBranchLabel);
    }
    return buildAccountingPreviewHtml(reportName, sectionLabel, isDark, undefined, companyInfo, companyBranchLabel);
  }

  function getExportRows({
    categoryKey: _categoryKey,
    reportCode: _reportCode,
    reportName,
    sectionLabel,
  }: {
    categoryKey: string;
    reportCode: string;
    reportName: string;
    sectionLabel: string;
  }) {
    return [
      {
        Report: reportName,
        Section: sectionLabel,
      },
    ];
  }

  function getReportDefinition(reportCode: string): ReportDefinition {
    switch (reportCode) {
      case 'R1A06':
        return {
          columns: [
            { key: 'date', label: 'Date', minWidth: '90px' },
            { key: 'supplierName', label: 'Supplier Name', minWidth: '170px' },
            { key: 'address', label: 'Address', minWidth: '170px' },
            { key: 'vatTin', label: 'VAT REG. TIN', minWidth: '150px' },
            { key: 'orRefNo', label: 'OR/Sales Inv./Ref No.', minWidth: '200px' },
            { key: 'expenseType', label: 'Type of Expense', minWidth: '170px' },
            {
              key: 'vatableAmount',
              label: 'Vatable Amount',
              align: 'right',
              minWidth: '150px',
            },
            {
              key: 'inputTax',
              label: 'Input Tax',
              align: 'right',
              minWidth: '120px',
            },
            {
              key: 'totalPurchases',
              label: 'Total Purchases',
              align: 'right',
              minWidth: '160px',
            },
          ],
          rows: [],
        };

      case 'R1A061':
        return {
          columns: [
            { key: 'date', label: 'Date', minWidth: '90px' },
            { key: 'borrowerName', label: 'Borrower Name', minWidth: '180px' },
            { key: 'orNo', label: 'OR No.', minWidth: '120px' },
            { key: 'tin', label: 'TIN', minWidth: '130px' },
            {
              key: 'loanCollection',
              label: 'Loan Collection',
              align: 'right',
              minWidth: '150px',
            },
            {
              key: 'outputTax',
              label: 'Output Tax',
              align: 'right',
              minWidth: '130px',
            },
            {
              key: 'totalAmount',
              label: 'Total Amount',
              align: 'right',
              minWidth: '140px',
            },
          ],
          rows: [],
        };

      case 'R1A07':
        return {
          columns: [
            { key: 'accountNo', label: 'Account No.', minWidth: '130px' },
            { key: 'accountName', label: 'Account Name', minWidth: '180px' },
            { key: 'statementDate', label: 'Statement Date', minWidth: '130px' },
            { key: 'reference', label: 'Reference', minWidth: '130px' },
            { key: 'debit', label: 'Debit', align: 'right', minWidth: '120px' },
            { key: 'credit', label: 'Credit', align: 'right', minWidth: '120px' },
            { key: 'balance', label: 'Balance', align: 'right', minWidth: '130px' },
          ],
          rows: [],
        };

      case 'R1A081':
      case 'R1A082':
      case 'R1A083':
      case 'R1A084':
      case 'R1A085':
        return {
          columns: [
            { key: 'date', label: 'Date', minWidth: '100px' },
            { key: 'journalNo', label: 'Journal No.', minWidth: '130px' },
            { key: 'accountCode', label: 'Account Code', minWidth: '130px' },
            { key: 'accountName', label: 'Account Name', minWidth: '180px' },
            { key: 'description', label: 'Description', minWidth: '220px' },
            { key: 'remarks', label: 'Remarks', minWidth: '180px' },
          ],
          rows: [],
        };

      case 'R1I01':
        return {
          columns: [
            { key: 'requestDate', label: 'Request Date', minWidth: '120px' },
            { key: 'prNumber', label: 'PR Number', minWidth: '130px' },
            { key: 'department', label: 'Department', minWidth: '150px' },
            { key: 'requestedBy', label: 'Requested By', minWidth: '150px' },
            { key: 'status', label: 'Status', minWidth: '110px' },
            { key: 'remarks', label: 'Remarks', minWidth: '180px' },
          ],
          rows: [],
        };

      case 'R1I02':
        return {
          columns: [
            { key: 'prNumber', label: 'PR Number', minWidth: '130px' },
            { key: 'requestDate', label: 'Request Date', minWidth: '120px' },
            { key: 'supplier', label: 'Supplier', minWidth: '170px' },
            { key: 'totalItems', label: 'Total Items', align: 'right', minWidth: '120px' },
            { key: 'totalAmount', label: 'Total Amount', align: 'right', minWidth: '140px' },
            { key: 'status', label: 'Status', minWidth: '110px' },
          ],
          rows: [],
        };

      case 'R1I03':
        return {
          columns: [
            { key: 'itemCode', label: 'Item Code', minWidth: '120px' },
            { key: 'itemDescription', label: 'Item Description', minWidth: '220px' },
            { key: 'unit', label: 'Unit', minWidth: '90px' },
            { key: 'quantity', label: 'Quantity', align: 'right', minWidth: '110px' },
            { key: 'requestDate', label: 'Request Date', minWidth: '120px' },
            { key: 'prNumber', label: 'PR Number', minWidth: '130px' },
          ],
          rows: [],
        };

      case 'R1O00':
      case 'R1S00':
      case 'R2O00':
      case 'R2S00':
        return {
          columns: [
            { key: 'salesDate', label: 'Sales Date', minWidth: '120px' },
            { key: 'invoiceNo', label: 'Invoice No.', minWidth: '130px' },
            { key: 'customerName', label: 'Customer Name', minWidth: '180px' },
            { key: 'cashier', label: 'Cashier', minWidth: '140px' },
            { key: 'paymentType', label: 'Payment Type', minWidth: '130px' },
            { key: 'grossSales', label: 'Gross Sales', align: 'right', minWidth: '130px' },
            { key: 'discount', label: 'Discount', align: 'right', minWidth: '110px' },
            { key: 'netSales', label: 'Net Sales', align: 'right', minWidth: '130px' },
          ],
          rows: [],
        };

      case 'R3O00':
      case 'R5S00':
      case 'R6S00':
        return {
          columns: [
            { key: 'salesDate', label: 'Sales Date', minWidth: '120px' },
            { key: 'itemCode', label: 'Item Code', minWidth: '120px' },
            { key: 'itemDescription', label: 'Item Description', minWidth: '220px' },
            { key: 'brand', label: 'Brand', minWidth: '130px' },
            { key: 'model', label: 'Model', minWidth: '130px' },
            { key: 'quantity', label: 'Qty', align: 'right', minWidth: '90px' },
            { key: 'amount', label: 'Amount', align: 'right', minWidth: '130px' },
          ],
          rows: [],
        };

      case 'R3S00':
      case 'R4O00':
      case 'R4S00':
      case 'R5O00':
      case 'R6O00':
        return {
          columns: [
            { key: 'salesDate', label: 'Sales Date', minWidth: '120px' },
            { key: 'category', label: 'Category', minWidth: '160px' },
            { key: 'description', label: 'Description', minWidth: '220px' },
            { key: 'staff', label: 'Staff', minWidth: '140px' },
            { key: 'marketSegment', label: 'Market Segment', minWidth: '160px' },
            { key: 'quantity', label: 'Qty', align: 'right', minWidth: '90px' },
            { key: 'totalSales', label: 'Total Sales', align: 'right', minWidth: '140px' },
          ],
          rows: [],
        };
        default:
        return {
          columns: [
            { key: 'date', label: 'Date', minWidth: '100px' },
            { key: 'reference', label: 'Reference', minWidth: '140px' },
            { key: 'description', label: 'Description', minWidth: '220px' },
            { key: 'remarks', label: 'Remarks', minWidth: '180px' },
          ],
          rows: [],
        };
    }
  }

  function buildLoanPreviewHtml({
    reportName,
    sectionLabel,
    isDark,
    columns,
    rows,
  }: {
    reportName: string;
    sectionLabel: string;
    isDark: boolean;
    columns: TableColumn[];
    rows: TableRow[];
  }) {
    const bodyBg = isDark ? '#101d3d' : '#ffffff';
    const bodyText = isDark ? '#f8fafc' : '#0f172a';
    const sheetBg = isDark ? '#101d3d' : '#ffffff';
    const sheetBorder = isDark ? 'rgba(148, 163, 184, 0.38)' : '#d8dfea';
    const tableBorder = isDark ? 'rgba(226, 232, 240, 0.72)' : '#cbd5e1';
    const headerBg = isDark ? 'rgba(15, 23, 42, 0.58)' : '#f8fafc';
    const mutedColor = isDark ? '#cbd5e1' : '#64748b';
    const iconBorder = isDark ? 'rgba(226, 232, 240, 0.25)' : '#d8dfea';

    const theadHtml = columns.some((c) => c.key === 'newP')
      ? `
        <tr>
          <th rowspan="4">Date</th>
          <th colspan="10" class="center">NO. OF CLIENTS</th>
          <th colspan="4" class="center">LOAN RELEASES</th>
          <th colspan="10" class="center">LOAN COLLECTIONS</th>
        </tr>
        <tr>
          <th colspan="4" class="center">New</th>
          <th colspan="5" class="center">Old</th>
          <th rowspan="3" class="center">TTL</th>
          <th colspan="2" class="center">PRINCIPAL</th>
          <th colspan="2" class="center">NET</th>
          <th rowspan="3" class="center">Amount<br />Withdrawn</th>
          <th colspan="2" class="center">Loan Payments</th>
          <th colspan="2" class="center">Liquidation</th>
          <th rowspan="3" class="center"><em>Bank<br />Charge</em></th>
          <th rowspan="3" class="center">Penalty</th>
          <th rowspan="3" class="center">Refund</th>
          <th rowspan="3" class="center">Total<br />Collections</th>
          <th rowspan="3" class="center"><em>Running<br />Balance</em></th>
        </tr>
        <tr>
          <th rowspan="2" class="center">P</th>
          <th rowspan="2" class="center">A</th>
          <th rowspan="2" class="center">S</th>
          <th rowspan="2" class="center">B</th>
          <th rowspan="2" class="center">RL</th>
          <th rowspan="2" class="center">LL</th>
          <th rowspan="2" class="center">AL</th>
          <th rowspan="2" class="center">EL</th>
          <th rowspan="2" class="center">XB</th>
          <th rowspan="2" class="center">Release</th>
          <th rowspan="2" class="center"><em>Running<br />Balance</em></th>
          <th rowspan="2" class="center">Release</th>
          <th rowspan="2" class="center"><em>Running<br />Balance</em></th>
          <th class="center">Current<br />Account</th>
          <th class="center">Overdue<br />Account</th>
          <th class="center">Current<br />Account</th>
          <th class="center">Advance<br />Payment</th>
        </tr>
        <tr></tr>
      `
      : `<tr>${columns
          .map((column) => {
            const widthStyle = column.minWidth
              ? ` style="min-width:${column.minWidth}"`
              : '';

            return `<th class="${getAlignClass(column.align)}"${widthStyle}>${escapeHtml(
              column.label,
            )}</th>`;
          })
          .join('')}</tr>`;

    const tbodyHtml =
      rows.length > 0
        ? rows
            .map(
              (row) => `
                <tr>
                  ${columns
                    .map((column) => {
                      const value = row[column.key] ?? '';
                      const widthStyle = column.minWidth
                        ? ` style="min-width:${column.minWidth}"`
                        : '';
                      return `<td class="${getAlignClass(
                        column.align,
                      )}"${widthStyle}>${escapeHtml(String(value))}</td>`;
                    })
                    .join('')}
                </tr>
              `,
            )
            .join('')
        : `
          <tr>
            <td colspan="${columns.length}">
              <div class="empty-state">
                <div class="empty-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7.75C4 6.784 4.784 6 5.75 6h12.5C19.216 6 20 6.784 20 7.75v8.5c0 .966-.784 1.75-1.75 1.75H5.75A1.75 1.75 0 0 1 4 16.25v-8.5Z" stroke="currentColor" stroke-width="1.6"/>
                    <path d="M4.5 13h4.2c.63 0 .96.28 1.22.74l.35.62c.24.42.55.64 1.1.64h1.26c.55 0 .86-.22 1.1-.64l.35-.62c.26-.46.59-.74 1.22-.74h4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                  </svg>
                </div>
                <span>No records available</span>
              </div>
            </td>
          </tr>
        `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }

            html,
            body {
              margin: 0;
              padding: 0;
            }

            body {
              min-width: 320px;
              font-family: Arial, Helvetica, sans-serif;
              color: ${bodyText};
              background: ${bodyBg};
            }

            .preview-shell {
              min-height: 100vh;
              padding: 16px;
              background: ${bodyBg};
            }

            .sheet {
              width: 100%;
              max-width: 1120px;
              margin: 0 auto;
              border: 1px dashed ${sheetBorder};
              border-radius: 18px;
              padding: 18px;
              background: ${sheetBg};
            }

            .company {
              display: flex;
              align-items: flex-start;
              gap: 10px;
              font-size: 13px;
              line-height: 1.45;
            }

            .company-icon {
              display: inline-flex;
              width: 24px;
              height: 24px;
              align-items: center;
              justify-content: center;
              border: 1px solid ${iconBorder};
              border-radius: 8px;
              color: ${bodyText};
              flex: 0 0 auto;
            }

            .company strong {
              display: block;
              margin-bottom: 2px;
              font-size: 17px;
              line-height: 1.25;
            }

            .header {
              margin: 20px 0 18px;
              text-align: center;
            }

            .header h1 {
              margin: 0;
              font-size: clamp(24px, 4.8vw, 44px);
              line-height: 1.12;
              font-weight: 800;
              letter-spacing: 0.01em;
              text-transform: uppercase;
            }

            .subtitle {
              margin-top: 5px;
              font-size: 13px;
              color: ${mutedColor};
            }

            .table-wrap {
              width: 100%;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
              border: 1px solid ${tableBorder};
              border-radius: 10px;
            }

            table {
              width: 100%;
              min-width: ${columns.length >= 9 ? '1380px' : columns.length >= 7 ? '980px' : '780px'};
              border-collapse: collapse;
              font-size: 13px;
              table-layout: auto;
            }

            th,
            td {
              border-right: 1px solid ${tableBorder};
              border-bottom: 1px solid ${tableBorder};
              padding: 9px 10px;
              vertical-align: middle;
            }

            th:last-child,
            td:last-child {
              border-right: none;
            }

            tbody tr:last-child td {
              border-bottom: none;
            }

            th {
              background: ${headerBg};
              font-size: 12px;
              font-weight: 700;
              color: ${bodyText};
              white-space: nowrap;
              word-break: normal;
            }

            td {
              color: ${bodyText};
              white-space: normal;
              word-break: break-word;
            }

            .left { text-align: left; }
            .center { text-align: center; }
            .right { text-align: right; }

            .empty-state {
              min-height: 92px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 8px;
              color: ${mutedColor};
              text-align: center;
            }

            .empty-icon {
              display: inline-flex;
              color: ${mutedColor};
            }

            @media (max-width: 640px) {
              .preview-shell {
                padding: 10px;
              }

              .sheet {
                border-radius: 14px;
                padding: 12px;
              }

              .company {
                font-size: 11px;
                gap: 8px;
              }

              .company-icon {
                width: 22px;
                height: 22px;
                border-radius: 7px;
              }

              .company strong {
                font-size: 14px;
              }

              .header {
                margin: 16px 0 14px;
              }

              .header h1 {
                font-size: clamp(19px, 7vw, 25px);
              }

              .subtitle {
                font-size: 11px;
              }

              table {
                min-width: ${columns.length >= 9 ? '1380px' : columns.length >= 7 ? '980px' : '680px'};
                font-size: 12px;
              }

              th,
              td {
                padding: 8px;
              }

              .empty-state {
                min-height: 80px;
              }
            }

            @media print {
              body {
                background: #ffffff;
                color: #111827;
              }

              .preview-shell {
                min-height: auto;
                padding: 0;
                background: #ffffff;
              }

              .sheet {
                max-width: none;
                border: none;
                border-radius: 0;
                padding: 0;
                background: #ffffff;
              }

              .table-wrap {
                overflow: visible;
                border: 1px solid #000000;
              }

              table {
                min-width: 0;
              }

              th,
              td {
                border-color: #000000;
                color: #111827;
              }

              th {
                background: #f8fafc;
              }

              .subtitle,
              .empty-state,
              .empty-icon {
                color: #64748b;
              }

              .company-icon {
                border-color: #cbd5e1;
                color: #111827;
              }
            }
          </style>
        </head>
        <body>
          <main class="preview-shell">
            <section class="sheet">
              <div class="company">
                <span class="company-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-7h6v7M8 11h.01M12 11h.01M16 11h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
                <div>
                  <strong>Company Name</strong>
                  Branch Name<br />
                  Branch Address
                </div>
              </div>

              <div class="header">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">Period Covered</div>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    ${theadHtml}
                  </thead>
                  <tbody>
                    ${tbodyHtml}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </body>
      </html>
    `;
  }

  function buildJournalEntriesPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    entries: JournalEntryRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const columns: TableColumn[] = [
      { key: 'entryDate', label: 'Date', minWidth: '100px' },
      { key: 'journalNo', label: 'Journal No.', minWidth: '120px' },
      { key: 'accountCode', label: 'Account Code', minWidth: '120px' },
      { key: 'accountName', label: 'Account Name', minWidth: '170px' },
      { key: 'description', label: 'Description', minWidth: '200px' },
      { key: 'remarks', label: 'Remarks', minWidth: '160px' },
      { key: 'debit', label: 'Debit', align: 'right', minWidth: '110px' },
      { key: 'credit', label: 'Credit', align: 'right', minWidth: '110px' },
    ];

    const rowsHtml =
      entries.length > 0
        ? entries
            .map((e) => {
              const cells = [
                e.entryDate ? String(e.entryDate).split('T')[0] : '',
                e.journalNo ?? '',
                e.accountCode ?? '',
                e.accountName ?? '',
                e.description ?? '',
                e.remarks ?? '',
                e.debit ? e.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '',
                e.credit ? e.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '',
              ];
              return `<tr>${cells
                .map((val, i) => {
                  const align = columns[i].align === 'right' ? ' class="right"' : '';
                  return `<td${align}>${escapeHtml(String(val))}</td>`;
                })
                .join('')}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${columns.length}" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    const theadHtml = `<tr>${columns
      .map((c) => `<th class="${getAlignClass(c.align)}">${escapeHtml(c.label)}</th>`)
      .join('')}</tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 12px;
              color: ${bodyText};
              background: ${bodyBg};
            }
            .sheet {
              width: 100%;
              max-width: 1100px;
              margin: 0 auto;
              border: 1px dashed ${sheetBorder};
              padding: 14px;
              background: ${sheetBg};
            }
            .top {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 20px;
              flex-wrap: wrap;
            }
            .title h1 {
              margin: 0;
              font-size: clamp(20px, 4vw, 24px);
              line-height: 1.2;
              word-break: break-word;
            }
            .subtitle {
              margin-top: 6px;
              font-size: 13px;
              color: ${subtitleColor};
            }
            .table-wrap {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            table {
              width: 100%;
              min-width: 980px;
              border-collapse: collapse;
              font-size: 13px;
            }
            thead tr {
              border-top: 1px solid ${lineColor};
              border-bottom: 1px solid ${lineColor};
            }
            th, td {
              padding: 8px;
              text-align: left;
              white-space: normal;
              word-break: break-word;
            }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
              .subtitle { color: #64748b; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>${theadHtml}</thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // --- R1A02 REAL DATA: renders the real rpt_a102 rows in the desktop
  // report's own column layout (Journal No, Date, Payee, Description,
  // Check No, Account, Debit, Credit) — same visual style as
  // buildJournalEntriesPreviewHtml, just with R1A02's actual columns.
  function buildUnpostedEntriesPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    entries: UnpostedEntryRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const columns: TableColumn[] = [
      { key: 'j_num', label: 'Journal No.', minWidth: '110px' },
      { key: 't_date', label: 'Date', minWidth: '100px' },
      { key: 'payee', label: 'Payee', minWidth: '160px' },
      { key: 't_desc', label: 'Description', minWidth: '180px' },
      { key: 'ck_num', label: 'Check No.', minWidth: '110px' },
      { key: 'at_code', label: 'Account', minWidth: '150px' },
      { key: 'sl_name', label: 'Subsidiary', minWidth: '150px' },
      { key: 'debit', label: 'Debit', align: 'right', minWidth: '110px' },
      { key: 'credit', label: 'Credit', align: 'right', minWidth: '110px' },
    ];

    const fmtAmount = (n: number) =>
      n === 0 ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml =
      entries.length > 0
        ? entries
            .map((e) => {
              const accountCell = e.at_desc ? `${e.at_code} - ${e.at_desc}` : e.at_code;
              const cells = [
                e.j_num ?? '',
                e.t_date ?? '',
                e.payee ?? '',
                e.t_desc ?? '',
                e.ck_num ?? '',
                accountCell ?? '',
                e.sl_name ?? '',
                fmtAmount(e.debit ?? 0),
                fmtAmount(e.credit ?? 0),
              ];
              return `<tr>${cells
                .map((val, i) => {
                  const align = columns[i].align === 'right' ? ' class="right"' : '';
                  return `<td${align}>${escapeHtml(String(val))}</td>`;
                })
                .join('')}</tr>`;
            })
            .join('')
        : `<tr><td colspan="${columns.length}" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    const theadHtml = `<tr>${columns
      .map((c) => `<th class="${getAlignClass(c.align)}">${escapeHtml(c.label)}</th>`)
      .join('')}</tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 12px;
              color: ${bodyText};
              background: ${bodyBg};
            }
            .sheet {
              width: 100%;
              max-width: 1100px;
              margin: 0 auto;
              border: 1px dashed ${sheetBorder};
              padding: 14px;
              background: ${sheetBg};
            }
            .top {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 20px;
              flex-wrap: wrap;
            }
            .title h1 {
              margin: 0;
              font-size: clamp(20px, 4vw, 24px);
              line-height: 1.2;
              word-break: break-word;
            }
            .subtitle {
              margin-top: 6px;
              font-size: 13px;
              color: ${subtitleColor};
            }
            .table-wrap {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            table {
              width: 100%;
              min-width: 1020px;
              border-collapse: collapse;
              font-size: 13px;
            }
            thead tr {
              border-top: 1px solid ${lineColor};
              border-bottom: 1px solid ${lineColor};
            }
            th, td {
              padding: 8px;
              text-align: left;
              white-space: normal;
              word-break: break-word;
            }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
              .subtitle { color: #64748b; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>${theadHtml}</thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // --- R1A01 REAL DATA: `rows` param added. Omitted (every other call site)
  // -> identical "No records available" behavior as before. Provided (R1A01
  // and R1A03) -> renders real rows. --------------------------------------
  function buildGLSummaryPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    rows: GLSummaryRow[] | undefined,
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const fmtAmount = (n: number) =>
      n === 0 ? '0.00' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tbodyHtml =
      rows && rows.length > 0
        ? rows
            .map(
              (r) => `
                <tr>
                  <td>${escapeHtml(r.at_code ?? '')}</td>
                  <td>${escapeHtml(r.at_desc ?? '')}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.total_debit ?? 0))}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.total_credit ?? 0))}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.net_balance ?? 0))}</td>
                </tr>
              `,
            )
            .join('')
        : `
          <tr>
            <td colspan="5" style="text-align:center;padding:32px 8px;color:${subtitleColor};">
              No records available
            </td>
          </tr>
        `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 12px;
              color: ${bodyText};
              background: ${bodyBg};
            }
            .sheet {
              width: 100%;
              max-width: 920px;
              margin: 0 auto;
              background: ${sheetBg};
              border: 1px solid ${sheetBorder};
              border-radius: 8px;
              padding: 24px;
            }
            .top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 20px;
            }
            .top strong { font-size: 13px; }
            .title h1 {
              font-size: 18px;
              font-weight: 700;
              margin: 0;
              text-align: right;
            }
            .subtitle {
              font-size: 12px;
              color: ${subtitleColor};
              text-align: right;
            }
            .table-wrap { overflow-x: auto; }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
              min-width: 560px;
            }
            th {
              padding: 6px 8px;
              text-align: left;
              font-weight: 600;
              border-bottom: 1px solid ${lineColor};
            }
            td {
              padding: 5px 8px;
              border-bottom: 1px solid ${isDark ? '#1e293b' : '#f1f5f9'};
            }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #ffffff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #ffffff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
              .subtitle { color: #64748b; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th class="right">Total Debit</th>
                    <th class="right">Total Credit</th>
                    <th class="right">Net Balance</th>
                  </tr>
                </thead>
                <tbody>
                  ${tbodyHtml}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function buildFinancialPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    rows: FinancialStatementRow[] | undefined,
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';
    const fmt = (n: number) => n === 0 ? '0.00' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tbodyHtml = rows && rows.length > 0
      ? rows.map((r) => `
          <tr>
            <td>${escapeHtml(r.section ?? '')}</td>
            <td>${escapeHtml(r.at_code ?? '')}</td>
            <td>${escapeHtml(r.at_desc ?? '')}</td>
            <td class="right">${escapeHtml(fmt(r.bal_begin ?? 0))}</td>
            <td class="right">${escapeHtml(fmt(r.debit ?? 0))}</td>
            <td class="right">${escapeHtml(fmt(r.credit ?? 0))}</td>
            <td class="right">${escapeHtml(fmt(r.bal_end ?? 0))}</td>
          </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;
    return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(reportName)}</title>
      <style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:12px;color:${bodyText};background:${bodyBg}}
      .sheet{width:100%;max-width:980px;margin:0 auto;background:${sheetBg};border:1px solid ${sheetBorder};border-radius:8px;padding:24px}
      .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
      .top strong{font-size:13px}.title h1{font-size:18px;font-weight:700;margin:0;text-align:right}
      .subtitle{font-size:12px;color:${subtitleColor};text-align:right}.table-wrap{overflow-x:auto}
      table{width:100%;border-collapse:collapse;font-size:12px;min-width:700px}
      th{padding:6px 8px;text-align:left;font-weight:600;border-bottom:1px solid ${lineColor}}
      td{padding:5px 8px;border-bottom:1px solid ${isDark ? '#1e293b' : '#f1f5f9'}}.right{text-align:right}
      @media print{body{padding:0;background:#fff;color:#111827}.sheet{border:none;padding:0;max-width:none}
      .table-wrap{overflow:visible}thead tr{border-top:1px solid #000;border-bottom:1px solid #000}.subtitle{color:#64748b}}</style>
      </head><body><div class="sheet">
      <div class="top">${buildCompanyHeaderBlock(companyInfo, branchLabel)}
      <div class="title"><h1>${escapeHtml(reportName)}</h1><div class="subtitle">${escapeHtml(sectionLabel)}</div></div></div>
      <div class="table-wrap"><table><thead><tr>
      <th>Section</th><th>Account Code</th><th>Account Name</th>
      <th class="right">Beg. Balance</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">End Balance</th>
      </tr></thead><tbody>${tbodyHtml}</tbody></table></div></div></body></html>`;
  }

  // --- SALES REAL DATA: OTC Sales Report preview HTML (R1000/R1S00/R2000/R2S00).
  function buildSalesPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    rows: SalesRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const fmt = (n: number) =>
      n === 0 ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml =
      rows.length > 0
        ? rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.salesDate ?? '')}</td>
              <td>${escapeHtml(r.invoiceNo ?? '')}</td>
              <td>${escapeHtml(r.customerName ?? '')}</td>
              <td>${escapeHtml(r.cashier ?? '')}</td>
              <td>${escapeHtml(r.paymentType ?? '')}</td>
              <td class="right">${escapeHtml(fmt(r.grossSales ?? 0))}</td>
              <td class="right">${escapeHtml(fmt(r.discount ?? 0))}</td>
              <td class="right">${escapeHtml(fmt(r.netSales ?? 0))}</td>
            </tr>`).join('')
        : `<tr><td colspan="8" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 12px; color: ${bodyText}; background: ${bodyBg}; }
            .sheet { width: 100%; max-width: 1200px; margin: 0 auto; border: 1px dashed ${sheetBorder}; padding: 14px; background: ${sheetBg}; }
            .top { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
            .title h1 { margin: 0; font-size: clamp(18px, 3.5vw, 22px); line-height: 1.2; word-break: break-word; }
            .subtitle { margin-top: 6px; font-size: 13px; color: ${subtitleColor}; }
            .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            table { width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 13px; }
            thead tr { border-top: 1px solid ${lineColor}; border-bottom: 1px solid ${lineColor}; }
            th, td { padding: 8px; text-align: left; white-space: normal; word-break: break-word; }
            tbody tr { border-bottom: 1px solid ${isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}; }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sales Date</th><th>Invoice No.</th><th>Customer Name</th>
                    <th>Cashier</th><th>Payment Type</th>
                    <th class="right">Gross Sales</th><th class="right">Discount</th><th class="right">Net Sales</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // --- INVENTORY REAL DATA: generic preview builder shared across all
  // Inventory Reports. Columns are UNCONFIRMED — see InventoryRow type
  // comment for why.
  function buildInventoryPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    rows: InventoryRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const rowsHtml =
      rows.length > 0
        ? rows.map((r) => `
            <tr>
              <td>${escapeHtml(r.date ?? '')}</td>
              <td>${escapeHtml(r.reference ?? '')}</td>
              <td>${escapeHtml(r.description ?? '')}</td>
              <td>${escapeHtml(r.requestedBy ?? '')}</td>
              <td class="right">${r.quantity ?? 0}</td>
              <td>${escapeHtml(r.docNo ?? '')}</td>
            </tr>`).join('')
        : `<tr><td colspan="6" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 12px; color: ${bodyText}; background: ${bodyBg}; }
            .sheet { width: 100%; max-width: 1200px; margin: 0 auto; border: 1px dashed ${sheetBorder}; padding: 14px; background: ${sheetBg}; }
            .top { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
            .title h1 { margin: 0; font-size: clamp(18px, 3.5vw, 22px); line-height: 1.2; word-break: break-word; }
            .subtitle { margin-top: 6px; font-size: 13px; color: ${subtitleColor}; }
            .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            table { width: 100%; min-width: 900px; border-collapse: collapse; font-size: 13px; }
            thead tr { border-top: 1px solid ${lineColor}; border-bottom: 1px solid ${lineColor}; }
            th, td { padding: 8px; text-align: left; white-space: normal; word-break: break-word; }
            tbody tr { border-bottom: 1px solid ${isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}; }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Reference</th><th>Description</th>
                    <th>Requested By</th><th class="right">Qty</th><th>Doc No.</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function buildAccountingPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    rows: AccountActivityRow[] | undefined,
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const fmtAmount = (n: number) =>
      n === 0 ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tbodyHtml =
      rows && rows.length > 0
        ? rows
            .map(
              (r) => `
                <tr>
                  <td>${escapeHtml(r.date ?? '')}</td>
                  <td>${escapeHtml(r.reference ?? '')}</td>
                  <td>${escapeHtml(r.description ?? '')}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.debit ?? 0))}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.credit ?? 0))}</td>
                  <td class="right">${escapeHtml(fmtAmount(r.running_balance ?? 0))}</td>
                </tr>
              `,
            )
            .join('')
        : `
          <tr>
            <td colspan="6" style="text-align:center;padding:32px 8px;color:${subtitleColor};">
              No records available
            </td>
          </tr>
        `;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }

            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 12px;
              color: ${bodyText};
              background: ${bodyBg};
            }

            .sheet {
              width: 100%;
              max-width: 920px;
              margin: 0 auto;
              border: 1px dashed ${sheetBorder};
              padding: 14px;
              background: ${sheetBg};
            }

            .top {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 20px;
              flex-wrap: wrap;
            }

            .title {
              text-align: left;
            }

            .title h1 {
              margin: 0;
              font-size: clamp(20px, 4vw, 24px);
              line-height: 1.2;
              word-break: break-word;
            }

            .subtitle {
              margin-top: 6px;
              font-size: 13px;
              color: ${subtitleColor};
            }

            .table-wrap {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }

            table {
              width: 100%;
              min-width: 760px;
              border-collapse: collapse;
              font-size: 14px;
            }

            thead tr {
              border-top: 1px solid ${lineColor};
              border-bottom: 1px solid ${lineColor};
            }

            th,
            td {
              padding: 10px 8px;
              text-align: left;
              white-space: normal;
              word-break: break-word;
            }

            tbody tr {
              border-bottom: 1px solid ${isDark ? 'rgba(148,163,184,0.25)' : '#e2e8f0'};
            }

            .right { text-align: right; }

            @media (max-width: 640px) {
              body { padding: 8px; }
              .sheet { padding: 12px; }
              table { min-width: 680px; font-size: 12px; }
            }

            @media print {
              body {
                padding: 0;
                background: #ffffff;
                color: #111827;
              }
              .sheet {
                border: none;
                padding: 0;
                max-width: none;
                background: #ffffff;
              }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr {
                border-top: 1px solid #000;
                border-bottom: 1px solid #000;
              }
              .subtitle {
                color: #64748b;
              }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th class="right">Debit</th>
                    <th class="right">Credit</th>
                    <th class="right">Running Bal.</th>
                  </tr>
                </thead>
                <tbody>
                  ${tbodyHtml}
                </tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }


  // --- R1A081 REAL DATA: preview HTML with its own column layout.
  function buildUnbalanceJournalPreviewHtml(
    reportName: string,
    sectionLabel: string,
    isDark: boolean,
    entries: UnbalanceJournalRow[],
    companyInfo: CompanyInfo | null,
    branchLabel: string,
  ) {
    const bodyBg = isDark ? '#0f172a' : '#ffffff';
    const bodyText = isDark ? '#e5e7eb' : '#111827';
    const sheetBg = isDark ? '#111827' : '#ffffff';
    const sheetBorder = isDark ? '#475569' : '#94a3b8';
    const lineColor = isDark ? '#cbd5e1' : '#000000';
    const subtitleColor = isDark ? '#94a3b8' : '#64748b';

    const fmtAmount = (n: number) =>
      n === 0 ? '' : n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rowsHtml =
      entries.length > 0
        ? entries.map((e) => `
            <tr>
              <td>${escapeHtml(e.date ?? '')}</td>
              <td>${escapeHtml(e.j_num ?? '')}</td>
              <td>${escapeHtml(e.at_code ?? '')}</td>
              <td>${escapeHtml(e.at_desc ?? '')}</td>
              <td>${escapeHtml(e.description ?? '')}</td>
              <td>${escapeHtml(e.remarks ?? '')}</td>
              <td class="right">${escapeHtml(fmtAmount(e.debit ?? 0))}</td>
              <td class="right">${escapeHtml(fmtAmount(e.credit ?? 0))}</td>
            </tr>`).join('')
        : `<tr><td colspan="8" style="text-align:center;padding:32px 8px;color:${subtitleColor};">No records available</td></tr>`;

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(reportName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 12px; color: ${bodyText}; background: ${bodyBg}; }
            .sheet { width: 100%; max-width: 1200px; margin: 0 auto; border: 1px dashed ${sheetBorder}; padding: 14px; background: ${sheetBg}; }
            .top { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
            .title h1 { margin: 0; font-size: clamp(18px, 3.5vw, 22px); line-height: 1.2; word-break: break-word; }
            .subtitle { margin-top: 6px; font-size: 13px; color: ${subtitleColor}; }
            .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            table { width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 13px; }
            thead tr { border-top: 1px solid ${lineColor}; border-bottom: 1px solid ${lineColor}; }
            th, td { padding: 8px; text-align: left; white-space: normal; word-break: break-word; }
            tbody tr { border-bottom: 1px solid ${isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}; }
            .right { text-align: right; }
            @media print {
              body { padding: 0; background: #fff; color: #111827; }
              .sheet { border: none; padding: 0; max-width: none; background: #fff; }
              .table-wrap { overflow: visible; }
              table { min-width: 0; }
              thead tr { border-top: 1px solid #000; border-bottom: 1px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              ${buildCompanyHeaderBlock(companyInfo, branchLabel)}
              <div class="title">
                <h1>${escapeHtml(reportName)}</h1>
                <div class="subtitle">${escapeHtml(sectionLabel)}</div>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journal No.</th>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Description</th>
                    <th>Remarks</th>
                    <th class="right">Debit</th>
                    <th class="right">Credit</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  function buildCompanyHeaderBlock(companyInfo: CompanyInfo | null, branchLabel: string) {
    const name = companyInfo?.comp_name || 'Company Name';
    const branch = branchLabel || 'Branch Name';
    return `<div><strong>${escapeHtml(name)}</strong><br />${escapeHtml(branch)}</div>`;
  }

  function getAlignClass(align?: 'left' | 'center' | 'right') {
    if (align === 'center') return 'center';
    if (align === 'right') return 'right';
    return 'left';
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')          
      .replaceAll("'", '&#39;');
  }