'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  FileText,
  ChevronRight,
  Eye,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { reportsData } from '../reports-data';

type Category = (typeof reportsData)[number];

type TableColumn = {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
};

type TableRow = Record<string, string | number>;

type LoanReportDefinition = {
  columns: TableColumn[];
  rows: TableRow[];
};

const clearFieldsButtonClass =
  'h-11 w-full sm:w-auto !border-[#d8cb77] !bg-[#efe39a] !text-[#3f3612] hover:!bg-[#e7da8d] hover:!text-[#3f3612]';

export default function CategoryPanel({
  category,
}: {
  category: Category;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDark, setIsDark] = useState(false);

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

  const defaultSection = category.sections[0] ?? null;

  const sectionFromUrl = searchParams.get('section');
  const reportFromUrl = searchParams.get('report');
  const search = searchParams.get('search') ?? '';

  const activeSection =
    category.sections.find((section) => section.key === sectionFromUrl) ??
    defaultSection;

  const selectedReport =
    activeSection?.items.find((item) => item.code === reportFromUrl) ?? null;

  const filteredItems = useMemo(() => {
    if (!activeSection) return [];

    const q = search.trim().toLowerCase();
    if (!q) return activeSection.items;

    return activeSection.items.filter(
      (item) =>
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
    );
  }, [activeSection, search]);

  const updateQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleSectionChange = (sectionKey: string) => {
    updateQuery({
      section: sectionKey,
      report: null,
    });
  };

  const handleReportSelect = (reportCode: string) => {
    updateQuery({
      section: activeSection?.key ?? defaultSection?.key ?? null,
      report: reportCode,
    });
  };

  const handleBackToList = () => {
    updateQuery({
      report: null,
    });
  };

  const handleSearchChange = (value: string) => {
    updateQuery({
      search: value || null,
    });
  };

  const handlePrintPreview = () => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  };

  const handleExportExcel = () => {
    if (!selectedReport) return;

    const rows = getExportRows({
      categoryKey: category.key,
      reportCode: selectedReport.code,
      reportName: selectedReport.name,
      sectionLabel: activeSection?.label ?? category.label,
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      selectedReport.code.slice(0, 31)
    );

    const safeFileName = `${selectedReport.code}-${selectedReport.name}`
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim();

    XLSX.writeFile(workbook, `${safeFileName}.xlsx`);
  };

  if (selectedReport) {
    const previewHtml = getPreviewHtml({
      categoryKey: category.key,
      reportCode: selectedReport.code,
      reportName: selectedReport.name,
      sectionLabel: activeSection?.label ?? category.label,
      isDark,
    });

    return (
      <div className="space-y-4">
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleBackToList}
            className="inline-flex items-center rounded-xl border border-[#d8dfea] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#101d3d] dark:text-white dark:hover:bg-[#122147]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </button>
        </div>

        {renderFilterCard(category.key)}

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

            <div className="overflow-hidden rounded-2xl border border-[#d8dfea] bg-white shadow-sm dark:border-white/10 dark:bg-[#101d3d]">
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
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
                {activeSection?.label || category.label}
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Select a report to open
              </p>
            </div>

            <div className="relative w-full lg:w-[330px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search report code or name"
                className="h-11 rounded-full border-[#d8dfea] bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {category.sections.map((section) => {
              const isActive = section.key === activeSection?.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => handleSectionChange(section.key)}
                  className={cn(
                    'rounded-full px-5 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-orange-500 text-white'
                      : 'bg-[#e9edf4] text-slate-700 hover:bg-[#dde5ef] dark:bg-[#1a2748] dark:text-slate-200 dark:hover:bg-[#22345d]'
                  )}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {filteredItems.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => handleReportSelect(item.code)}
            className="block w-full text-left"
          >
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-[#d8dfea] bg-[#f8f8f9] px-4 py-4 transition hover:bg-[#eef1f6] sm:px-6 sm:py-5 dark:border-white/10 dark:bg-[#0b1733] dark:hover:bg-[#122147]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff3e8] text-[#ea580c] dark:bg-[#2b1c1c] dark:text-orange-300">
                  <FileText className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 inline-flex rounded-full border border-[#d8dfea] px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:text-slate-200">
                    {item.code}
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 sm:text-lg dark:text-white">
                    {item.name}
                  </h3>
                </div>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function renderFilterCard(categoryKey: string) {
  if (isLoanCategory(categoryKey)) {
    return <LoanFilterCard />;
  }

  if (isInventoryCategory(categoryKey)) {
    return <InventoryFilterCard />;
  }

  return <AccountingFilterCard />;
}

function isInventoryCategory(categoryKey: string) {
  return categoryKey.toLowerCase().includes('inventory');
}

function isLoanCategory(categoryKey: string) {
  return categoryKey.toLowerCase().includes('loan');
}

function AccountingFilterCard() {
  return (
    <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              By Branch
            </label>
            <Select defaultValue="head-office">
              <SelectTrigger className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="head-office">HEAD OFFICE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Account ID
              </label>
              <Select defaultValue="all">
                <SelectTrigger className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Journal From
              </label>
              <Input className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Journal To
              </label>
              <Input className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]" />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col xl:items-end">
            <Button className="h-11 w-full bg-[#1570ef] text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>

            <Button variant="outline" className={clearFieldsButtonClass}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Entry Dates
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                type="date"
                className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
              <Input
                type="date"
                className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-1 lg:pt-8">
            <div className="flex items-center space-x-2">
              <Checkbox id="unposted" defaultChecked />
              <label
                htmlFor="unposted"
                className="text-sm text-slate-700 dark:text-slate-200"
              >
                Unposted Entries
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox id="posted" defaultChecked />
              <label
                htmlFor="posted"
                className="text-sm text-slate-700 dark:text-slate-200"
              >
                Posted Entries
              </label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InventoryFilterCard() {
  return (
    <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              By Branch
            </label>
            <Select defaultValue="head-office">
              <SelectTrigger className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="head-office">HEAD OFFICE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Transaction Dates
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                type="date"
                className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
              <Input
                type="date"
                className="h-11 border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col xl:items-end">
            <Button className="h-11 w-full bg-[#1570ef] text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>

            <Button variant="outline" className={clearFieldsButtonClass}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanFilterCard() {
  return (
    <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              By Branch
            </label>
            <Select defaultValue="dumaguete">
              <SelectTrigger className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dumaguete">DUMAGUETE</SelectItem>
                <SelectItem value="head-office">HEAD OFFICE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Date From
            </label>
            <Input
              type="date"
              className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Date To
            </label>
            <Input
              type="date"
              className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Interest Type
            </label>
            <Select defaultValue="all-interest">
              <SelectTrigger className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select interest type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-interest">All Interest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Loan Type
            </label>
            <Select defaultValue="all-loan-type">
              <SelectTrigger className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select loan type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-loan-type">All Loan Type</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Loan Class
            </label>
            <Select defaultValue="all-loan-class">
              <SelectTrigger className="h-11 w-full border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
                <SelectValue placeholder="Select loan class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-loan-class">All Loan Class</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row xl:col-span-12 xl:justify-end">
            <Button className="h-11 w-full bg-[#1570ef] text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>

            <Button variant="outline" className={clearFieldsButtonClass}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getPreviewHtml({
  categoryKey,
  reportCode,
  reportName,
  sectionLabel,
  isDark,
}: {
  categoryKey: string;
  reportCode: string;
  reportName: string;
  sectionLabel: string;
  isDark: boolean;
}) {
  if (reportCode.startsWith('R1L')) {
    const definition = getLoanReportDefinition(reportCode);

    return buildLoanPreviewHtml({
      reportName,
      sectionLabel,
      isDark,
      columns: definition.columns,
      rows: definition.rows,
    });
  }

  if (isInventoryCategory(categoryKey)) {
    return buildInventoryPreviewHtml(reportName, sectionLabel, isDark);
  }

  return buildAccountingPreviewHtml(reportName, sectionLabel, isDark);
}

function getExportRows({
  categoryKey,
  reportCode,
  reportName,
  sectionLabel,
}: {
  categoryKey: string;
  reportCode: string;
  reportName: string;
  sectionLabel: string;
}) {
  if (reportCode.startsWith('R1L')) {
    const definition = getLoanReportDefinition(reportCode);
    return definition.rows;
  }

  if (isInventoryCategory(categoryKey)) {
    return [
      {
        'Trans. Date': '',
        Reference: '',
        'Item Code': '',
        'Item Description': '',
        Qty: '',
        'Request By': '',
      },
    ];
  }

  if (isLoanCategory(categoryKey)) {
    return [
      {
        Report: reportName,
        Section: sectionLabel,
      },
    ];
  }

  return [
    {
      Date: '03/31/2026',
      Reference: '',
      Description: 'Balance Forwarded',
      Debit: 0.0,
      Credit: 0.0,
      'Running Balance': 0.0,
    },
  ];
}

function getLoanReportDefinition(reportCode: string): LoanReportDefinition {
  switch (reportCode) {
    case 'R1L01':
      return {
        columns: [
          { key: 'applicationDate', label: 'Application Date' },
          { key: 'applicationNo', label: 'Application No.' },
          { key: 'borrowerName', label: 'Borrower Name' },
          { key: 'loanType', label: 'Loan Type' },
          { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows: [
          {
            applicationDate: '04/07/2026',
            applicationNo: 'APP-0001',
            borrowerName: '',
            loanType: 'Salary Loan',
            loanAmount: '15,000.00',
            status: 'Pending',
          },
        ],
      };

    case 'R1L02':
      return {
        columns: [
          { key: 'loanType', label: 'Loan Type' },
          {
            key: 'totalApplications',
            label: 'Total Applications',
            align: 'right',
          },
          { key: 'approved', label: 'Approved', align: 'right' },
          { key: 'pending', label: 'Pending', align: 'right' },
          { key: 'cancelled', label: 'Cancelled', align: 'right' },
          { key: 'totalAmount', label: 'Total Amount', align: 'right' },
        ],
        rows: [
          {
            loanType: 'Salary Loan',
            totalApplications: '12',
            approved: '7',
            pending: '3',
            cancelled: '2',
            totalAmount: '180,000.00',
          },
          {
            loanType: 'Business Loan',
            totalApplications: '5',
            approved: '2',
            pending: '1',
            cancelled: '2',
            totalAmount: '250,000.00',
          },
        ],
      };

    case 'R1L03':
      return {
        columns: [
          { key: 'dateApplied', label: 'Date Applied' },
          { key: 'applicationNo', label: 'Application No.' },
          { key: 'borrowerName', label: 'Borrower Name' },
          { key: 'loanType', label: 'Loan Type' },
          { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
          { key: 'chequeStatus', label: 'Cheque Status' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: [
          {
            dateApplied: '04/07/2026',
            applicationNo: 'APP-0004',
            borrowerName: '',
            loanType: 'Business Loan',
            loanAmount: '25,000.00',
            chequeStatus: 'Unreleased',
            remarks: 'Awaiting release schedule',
          },
        ],
      };

    case 'R1L04':
      return {
        columns: [
          { key: 'releaseDate', label: 'Release Date' },
          { key: 'applicationNo', label: 'Application No.' },
          { key: 'borrowerName', label: 'Borrower Name' },
          { key: 'loanType', label: 'Loan Type' },
          { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
          { key: 'chequeNo', label: 'Cheque No.' },
          { key: 'releasedBy', label: 'Released By' },
        ],
        rows: [
          {
            releaseDate: '04/07/2026',
            applicationNo: 'APP-0006',
            borrowerName: '',
            loanType: 'Salary Loan',
            loanAmount: '18,500.00',
            chequeNo: 'CHK-101234',
            releasedBy: 'Cashier',
          },
        ],
      };

    case 'R1L05':
      return {
        columns: [
          { key: 'dateCancelled', label: 'Date Cancelled' },
          { key: 'applicationNo', label: 'Application No.' },
          { key: 'borrowerName', label: 'Borrower Name' },
          { key: 'loanType', label: 'Loan Type' },
          { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
          { key: 'cancelledBy', label: 'Cancelled By' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: [
          {
            dateCancelled: '04/07/2026',
            applicationNo: 'APP-0008',
            borrowerName: '',
            loanType: 'Salary Loan',
            loanAmount: '15,000.00',
            cancelledBy: 'Admin',
            remarks: 'Client request',
          },
          {
            dateCancelled: '04/07/2026',
            applicationNo: 'APP-0010',
            borrowerName: '',
            loanType: 'Business Loan',
            loanAmount: '35,000.00',
            cancelledBy: 'Branch Officer',
            remarks: 'Incomplete follow-up documents',
          },
        ],
      };

    case 'R1L06':
      return {
        columns: [
          { key: 'dateDisapproved', label: 'Date Disapproved' },
          { key: 'applicationNo', label: 'Application No.' },
          { key: 'borrowerName', label: 'Borrower Name' },
          { key: 'loanType', label: 'Loan Type' },
          { key: 'loanAmount', label: 'Loan Amount', align: 'right' },
          { key: 'disapprovedBy', label: 'Disapproved By' },
          { key: 'reason', label: 'Reason' },
        ],
        rows: [
          {
            dateDisapproved: '04/07/2026',
            applicationNo: 'APP-0012',
            borrowerName: '',
            loanType: 'Salary Loan',
            loanAmount: '22,000.00',
            disapprovedBy: 'Manager',
            reason: 'Failed credit evaluation',
          },
        ],
      };

    default:
      return {
        columns: [
          { key: 'report', label: 'Report' },
          { key: 'remarks', label: 'Remarks' },
        ],
        rows: [
          {
            report: reportCode,
            remarks: 'No preview configuration yet.',
          },
        ],
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
  const bodyBg = isDark ? '#0f172a' : '#ffffff';
  const bodyText = isDark ? '#e5e7eb' : '#111827';
  const sheetBg = isDark ? '#111827' : '#ffffff';
  const sheetBorder = isDark ? '#475569' : '#94a3b8';
  const lineColor = isDark ? '#cbd5e1' : '#000000';
  const subtitleColor = isDark ? '#94a3b8' : '#64748b';
  const headerBg = isDark ? '#1e293b' : '#f8fafc';

  const theadHtml = columns
    .map(
      (column) =>
        `<th class="${getAlignClass(column.align)}">${escapeHtml(column.label)}</th>`
    )
    .join('');

  const tbodyHtml = rows
    .map(
      (row) => `
        <tr>
          ${columns
            .map((column) => {
              const value = row[column.key] ?? '';
              return `<td class="${getAlignClass(column.align)}">${escapeHtml(
                String(value)
              )}</td>`;
            })
            .join('')}
        </tr>
      `
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(reportName)}</title>
        <style>
          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
          }

          body {
            font-family: Arial, sans-serif;
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

          .company {
            font-size: 13px;
            line-height: 1.45;
          }

          .company strong {
            font-size: 17px;
          }

          .header {
            text-align: center;
            margin: 12px 0 16px;
          }

          .header h1 {
            margin: 0;
            font-size: clamp(24px, 5vw, 44px);
            line-height: 1.12;
            font-weight: 700;
            text-transform: uppercase;
            word-break: break-word;
          }

          .subtitle {
            margin-top: 6px;
            font-size: 13px;
            color: ${subtitleColor};
          }

          .table-wrap {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          table {
            width: 100%;
            min-width: 760px;
            border-collapse: collapse;
            font-size: 13px;
          }

          th,
          td {
            border: 1px solid ${lineColor};
            padding: 8px 10px;
            vertical-align: top;
            white-space: normal;
            word-break: break-word;
          }

          th {
            background: ${headerBg};
            font-weight: 700;
          }

          .left {
            text-align: left;
          }

          .center {
            text-align: center;
          }

          .right {
            text-align: right;
          }

          @media (max-width: 640px) {
            body {
              padding: 8px;
            }

            .sheet {
              padding: 12px;
            }

            .company {
              font-size: 12px;
            }

            .company strong {
              font-size: 15px;
            }

            .subtitle {
              font-size: 12px;
            }

            table {
              min-width: 680px;
              font-size: 12px;
            }

            th,
            td {
              padding: 7px 8px;
            }
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

            .table-wrap {
              overflow: visible;
            }

            table {
              min-width: 0;
            }

            th,
            td {
              border: 1px solid #000000;
            }

            th {
              background: #f8fafc;
            }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="company">
            <strong>OCS Lending Inc</strong><br />
            Dumaguete Branch<br />
            053 Piñili St, Dumaguete City
          </div>

          <div class="header">
            <h1>${escapeHtml(reportName)}</h1>
            <div class="subtitle">Period Covered: April 07, 2026 to April 07, 2026</div>
            <div class="subtitle">${escapeHtml(sectionLabel)}</div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>${theadHtml}</tr>
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

function buildAccountingPreviewHtml(
  reportName: string,
  sectionLabel: string,
  isDark: boolean
) {
  const bodyBg = isDark ? '#0f172a' : '#ffffff';
  const bodyText = isDark ? '#e5e7eb' : '#111827';
  const sheetBg = isDark ? '#111827' : '#ffffff';
  const sheetBorder = isDark ? '#475569' : '#94a3b8';
  const lineColor = isDark ? '#cbd5e1' : '#000000';
  const subtitleColor = isDark ? '#94a3b8' : '#64748b';

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
            .table-wrap {
              overflow: visible;
            }
            table {
              min-width: 0;
            }
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
            <div>
              <strong>OCS Lending Inc.</strong><br />
              HEAD OFFICE
            </div>
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
                <tr>
                  <td>03/31/2026</td>
                  <td></td>
                  <td>Balance Forwarded</td>
                  <td class="right">0.00</td>
                  <td class="right">0.00</td>
                  <td class="right">0.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildInventoryPreviewHtml(
  reportName: string,
  sectionLabel: string,
  isDark: boolean
) {
  const bodyBg = isDark ? '#0f172a' : '#ffffff';
  const bodyText = isDark ? '#e5e7eb' : '#111827';
  const sheetBg = isDark ? '#111827' : '#ffffff';
  const sheetBorder = isDark ? '#475569' : '#94a3b8';
  const lineColor = isDark ? '#cbd5e1' : '#000000';
  const subtitleColor = isDark ? '#94a3b8' : '#64748b';

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

          .title h1 {
            margin: 8px 0 0;
            font-size: clamp(22px, 5vw, 28px);
            word-break: break-word;
          }

          .meta {
            text-align: right;
            font-size: 12px;
          }

          .range {
            margin-bottom: 12px;
            font-size: 14px;
          }

          .section-label {
            margin-top: 6px;
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

          .right { text-align: right; }

          @media (max-width: 640px) {
            body { padding: 8px; }
            .sheet { padding: 12px; }
            .meta { text-align: left; }
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
            .table-wrap {
              overflow: visible;
            }
            table {
              min-width: 0;
            }
            thead tr {
              border-top: 1px solid #000;
              border-bottom: 1px solid #000;
            }
            .section-label {
              color: #64748b;
            }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="top">
            <div>
              <strong>OCS Lending Inc.</strong><br />
              HEAD OFFICE
              <div class="title"><h1>${escapeHtml(reportName)}</h1></div>
            </div>
            <div class="meta">
              ADMIN<br />
              Page 1 of 1<br />
              4/16/2026 11:05:10 AM
            </div>
          </div>

          <div class="range">
            <strong>Transaction Date(s):</strong> 2026-04-01 to 2026-04-16
            <div class="section-label">${escapeHtml(sectionLabel)}</div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trans. Date</th>
                  <th>Reference</th>
                  <th>Item Code</th>
                  <th>Item Description</th>
                  <th class="right">Qty</th>
                  <th class="right">Request By</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="6" style="text-align:center;color:${subtitleColor};padding:32px 8px;">
                    No records available
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
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