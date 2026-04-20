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
type ReportItem = Category['sections'][number]['items'][number];

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

  const sectionFromUrl = searchParams.get('section');
  const reportFromUrl = searchParams.get('report');
  const search = searchParams.get('search') ?? '';

  const activeSection =
    category.sections.find((section) => section.key === sectionFromUrl) ??
    category.sections[0];

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
      section: activeSection?.key ?? category.sections[0]?.key ?? null,
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

    let rows: Record<string, string | number>[] = [];

    if (category.key === 'accounting') {
      rows = [
        {
          Date: '03/31/2026',
          Reference: '',
          Description: 'Balance Forwarded',
          Debit: 0.0,
          Credit: 0.0,
          'Running Balance': 0.0,
        },
      ];
    } else if (category.key === 'inventory') {
      rows = [
        {
          'Trans. Date': '',
          Reference: '',
          'Item Code': '',
          'Item Description': '',
          Qty: '',
          'Request By': '',
        },
      ];
    } else {
      rows = [
        {
          Report: selectedReport.name,
          Section: activeSection?.label ?? category.label,
        },
      ];
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      selectedReport.code.slice(0, 31)
    );
    XLSX.writeFile(workbook, `${selectedReport.code}-${selectedReport.name}.xlsx`);
  };

  if (selectedReport) {
    const previewHtml =
      category.key === 'inventory'
        ? buildInventoryPreviewHtml(
            selectedReport.name,
            activeSection?.label ?? category.label,
            isDark
          )
        : buildAccountingPreviewHtml(
            selectedReport.name,
            activeSection?.label ?? category.label,
            isDark
          );

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

        {category.key === 'inventory' ? (
          <InventoryFilterCard />
        ) : (
          <AccountingFilterCard />
        )}

        <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                onClick={handlePrintPreview}
                className="bg-[#1570ef] text-white hover:bg-[#155fcb] dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]"
              >
                <Eye className="mr-2 h-4 w-4" />
                Export PDF
              </Button>

              <Button
                type="button"
                onClick={handleExportExcel}
                variant="outline"
                className="border-[#d8dfea] bg-white text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#101d3d] dark:text-white dark:hover:bg-[#122147]"
              >
                Export Excel
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#d8dfea] bg-white shadow-sm dark:border-white/10 dark:bg-[#101d3d]">
              <iframe
                ref={iframeRef}
                title={`${selectedReport.code} preview`}
                srcDoc={previewHtml}
                className="h-[520px] w-full bg-transparent"
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
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[30px] leading-none font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
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
            <div className="flex items-center justify-between rounded-3xl border border-[#d8dfea] bg-[#f8f8f9] px-6 py-5 transition hover:bg-[#eef1f6] dark:border-white/10 dark:bg-[#0b1733] dark:hover:bg-[#122147]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff3e8] text-[#ea580c] dark:bg-[#2b1c1c] dark:text-orange-300">
                  <FileText className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <div className="mb-2 inline-flex rounded-full border border-[#d8dfea] px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:border-white/10 dark:text-slate-200">
                    {item.code}
                  </div>
                  <h3 className="line-clamp-2 text-base font-semibold leading-snug text-slate-900 dark:text-white sm:text-lg">
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

function AccountingFilterCard() {
  return (
    <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              By Branch
            </label>
            <Select defaultValue="head-office">
              <SelectTrigger className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
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
                <SelectTrigger className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
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
              <Input className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Journal To
              </label>
              <Input className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]" />
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <Button className="bg-[#1570ef] text-white hover:bg-[#155fcb] dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>

            <Button
              variant="outline"
              className="border-[#d8dfea] bg-[#fff8cc] text-slate-800 hover:bg-[#fff3a6] dark:border-white/10 dark:bg-[#3a3212] dark:text-slate-100 dark:hover:bg-[#4a4016]"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[220px_auto_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Entry Dates
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
              <Input
                type="date"
                className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4 pb-1">
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
      <CardContent className="p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              By Branch
            </label>
            <Select defaultValue="head-office">
              <SelectTrigger className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]">
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
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
              <Input
                type="date"
                className="border-[#d8dfea] bg-white dark:border-white/10 dark:bg-[#101d3d]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <Button className="bg-[#1570ef] text-white hover:bg-[#155fcb] dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>

            <Button
              variant="outline"
              className="border-[#d8dfea] bg-[#fff8cc] text-slate-800 hover:bg-[#fff3a6] dark:border-white/10 dark:bg-[#3a3212] dark:text-slate-100 dark:hover:bg-[#4a4016]"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Clear Fields
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
        <title>${escapeHtml(reportName)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 24px;
            color: ${bodyText};
            background: ${bodyBg};
          }
          .sheet {
            max-width: 920px;
            margin: 0 auto;
            border: 1px dashed ${sheetBorder};
            padding: 16px;
            background: ${sheetBg};
          }
          .top {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 24px;
          }
          .title {
            text-align: right;
          }
          .title h1 {
            margin: 0;
            font-size: 24px;
            line-height: 1.2;
          }
          .subtitle {
            margin-top: 6px;
            font-size: 14px;
            color: ${subtitleColor};
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          thead tr {
            border-top: 1px solid ${lineColor};
            border-bottom: 1px solid ${lineColor};
          }
          th, td {
            padding: 10px 8px;
            text-align: left;
          }
          .right { text-align: right; }

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
        <title>${escapeHtml(reportName)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 24px;
            color: ${bodyText};
            background: ${bodyBg};
          }
          .sheet {
            max-width: 920px;
            margin: 0 auto;
            border: 1px dashed ${sheetBorder};
            padding: 16px;
            background: ${sheetBg};
          }
          .top {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 24px;
          }
          .title h1 {
            margin: 8px 0 0;
            font-size: 28px;
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
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          thead tr {
            border-top: 1px solid ${lineColor};
            border-bottom: 1px solid ${lineColor};
          }
          th, td {
            padding: 10px 8px;
            text-align: left;
          }
          .right { text-align: right; }

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
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}