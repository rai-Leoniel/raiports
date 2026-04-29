"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  FileText,
  ChevronRight,
  Eye,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { reportsData } from "../reports-data";

type Category = (typeof reportsData)[number];

type TableColumn = {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  minWidth?: string;
};

type TableRow = Record<string, string | number>;

type ReportDefinition = {
  columns: TableColumn[];
  rows: TableRow[];
};

const clearFieldsButtonClass =
  "h-11 w-full sm:w-auto !border-[#d8cb77] !bg-[#efe39a] !text-[#3f3612] hover:!bg-[#e7da8d] hover:!text-[#3f3612]";

export default function CategoryPanel({ category }: { category: Category }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const defaultSection = category.sections[0] ?? null;
  const sectionFromUrl = searchParams.get("section");
  const reportFromUrl = searchParams.get("report");
  const search = searchParams.get("search") ?? "";

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
        item.name.toLowerCase().includes(q),
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
      selectedReport.code.slice(0, 31),
    );

    const safeFileName = `${selectedReport.code}-${selectedReport.name}`
      .replace(/[\\/:*?"<>|]/g, "-")
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
      <div className="w-full space-y-4 pt-2">
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

        {renderFilterCard(category.key, selectedReport.code)}

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
                    "rounded-full px-5 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-orange-500 text-white"
                      : "bg-[#e9edf4] text-slate-700 hover:bg-[#dde5ef] dark:bg-[#1a2748] dark:text-slate-200 dark:hover:bg-[#22345d]",
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

function renderFilterCard(categoryKey: string, reportCode?: string) {
  if (reportCode === "R1L01") {
    return <R1L01FilterCard />;
  }

  if (isSalesCategory(categoryKey) || isSalesReport(reportCode)) {
    return <SalesFilterCard />;
  }

  if (isLoanCategory(categoryKey) || reportCode?.startsWith("R1L")) {
    return <LoanFilterCard />;
  }

  if (isInventoryCategory(categoryKey) || reportCode?.startsWith("R1I")) {
    return <InventoryFilterCard />;
  }

  return <AccountingFilterCard />;
}

function isInventoryCategory(categoryKey: string) {
  return categoryKey.toLowerCase().includes("inventory");
}

function isLoanCategory(categoryKey: string) {
  return categoryKey.toLowerCase().includes("loan");
}

function isSalesCategory(categoryKey: string) {
  return categoryKey.toLowerCase().includes("sales");
}

function isSalesReport(reportCode?: string) {
  if (!reportCode) return false;

  return [
    "R1000",
    "R1S00",
    "R2000",
    "R2500",
    "R3000",
    "R3500",
    "R4000",
    "R4500",
    "R5000",
    "R5500",
    "R6000",
    "R6500",
  ].includes(reportCode);
}

function R1L01FilterCard() {
  return (
    <Card className="rounded-[32px] border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-5 sm:p-6 md:p-7">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              By Branch
            </label>
            <Select defaultValue="default-branch">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default-branch">Select branch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Entry Date From
            </label>
            <Input
              type="date"
              aria-label="Entry date from"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Entry Date To
            </label>
            <Input
              type="date"
              aria-label="Entry date to"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button className="h-11 w-full rounded-xl bg-[#1570ef] px-5 text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>

          <Button
            variant="outline"
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
    <Card className="rounded-[32px] border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-5 sm:p-6 md:p-7">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              By Branch
            </label>
            <Select defaultValue="default-branch">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default-branch">Select branch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Date From
            </label>
            <Input
              type="date"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Date To
            </label>
            <Input
              type="date"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Interest Type
            </label>
            <Select defaultValue="all-interest">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select interest type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-interest">All Interest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Loan Type
            </label>
            <Select defaultValue="all-loan-type">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select loan type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-loan-type">All Loan Type</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Loan Class
            </label>
            <Select defaultValue="all-loan-class">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select loan class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-loan-class">All Loan Class</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button className="h-11 w-full rounded-xl bg-[#1570ef] px-5 text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>

          <Button
            variant="outline"
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

function SalesFilterCard() {
  return (
    <Card className="rounded-[32px] border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
      <CardContent className="p-5 sm:p-6 md:p-7">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              By Branch
            </label>
            <Select defaultValue="default-branch">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default-branch">Select branch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Sales Date From
            </label>
            <Input
              type="date"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Sales Date To
            </label>
            <Input
              type="date"
              className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white"
            />
          </div>

          <div className="min-w-0 space-y-2 xl:col-span-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-white">
              Cashier / Staff
            </label>
            <Select defaultValue="all">
              <SelectTrigger className="h-11 w-full rounded-xl border-[#d8dfea] bg-white text-slate-900 dark:border-white/10 dark:bg-[#101d3d] dark:text-white">
                <SelectValue placeholder="Select cashier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button className="h-11 w-full rounded-xl bg-[#1570ef] px-5 text-white hover:bg-[#155fcb] sm:w-auto dark:bg-[#1d6fe5] dark:hover:bg-[#1a63cc]">
            <Eye className="mr-2 h-4 w-4" />
            Preview
          </Button>

          <Button
            variant="outline"
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
  if (
    reportCode.startsWith("R1L") ||
    reportCode.startsWith("R1I") ||
    reportCode === "R1A06" ||
    reportCode === "R1A061" ||
    isSalesCategory(categoryKey) ||
    isSalesReport(reportCode)
  ) {
    const definition = getReportDefinition(reportCode);

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
  if (
    reportCode.startsWith("R1L") ||
    reportCode.startsWith("R1I") ||
    reportCode.startsWith("R1A") ||
    isSalesCategory(categoryKey) ||
    isSalesReport(reportCode)
  ) {
    return getReportDefinition(reportCode).rows;
  }

  return [
    {
      Report: reportName,
      Section: sectionLabel,
    },
  ];
}

function getReportDefinition(reportCode: string): ReportDefinition {
  switch (reportCode) {
    case "R1A06":
      return {
        columns: [
          { key: "date", label: "Date", minWidth: "90px" },
          { key: "supplierName", label: "Supplier Name", minWidth: "170px" },
          { key: "address", label: "Address", minWidth: "170px" },
          { key: "vatTin", label: "VAT REG. TIN", minWidth: "150px" },
          { key: "orRefNo", label: "OR/Sales Inv./Ref No.", minWidth: "200px" },
          { key: "expenseType", label: "Type of Expense", minWidth: "170px" },
          {
            key: "vatableAmount",
            label: "Vatable Amount",
            align: "right",
            minWidth: "150px",
          },
          {
            key: "inputTax",
            label: "Input Tax",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "totalPurchases",
            label: "Total Purchases",
            align: "right",
            minWidth: "160px",
          },
        ],
        rows: [],
      };

    case "R1A061":
      return {
        columns: [
          { key: "date", label: "Date", minWidth: "90px" },
          { key: "borrowerName", label: "Borrower Name", minWidth: "180px" },
          { key: "orNo", label: "OR No.", minWidth: "120px" },
          { key: "tin", label: "TIN", minWidth: "130px" },
          {
            key: "loanCollection",
            label: "Loan Collection",
            align: "right",
            minWidth: "150px",
          },
          {
            key: "outputTax",
            label: "Output Tax",
            align: "right",
            minWidth: "130px",
          },
          {
            key: "totalAmount",
            label: "Total Amount",
            align: "right",
            minWidth: "140px",
          },
        ],
        rows: [],
      };

    case "R1A07":
      return {
        columns: [
          { key: "accountNo", label: "Account No.", minWidth: "130px" },
          { key: "accountName", label: "Account Name", minWidth: "180px" },
          { key: "statementDate", label: "Statement Date", minWidth: "130px" },
          { key: "reference", label: "Reference", minWidth: "130px" },
          { key: "debit", label: "Debit", align: "right", minWidth: "120px" },
          { key: "credit", label: "Credit", align: "right", minWidth: "120px" },
          { key: "balance", label: "Balance", align: "right", minWidth: "130px" },
        ],
        rows: [],
      };

    case "R1A081":
    case "R1A082":
    case "R1A083":
    case "R1A084":
    case "R1A085":
      return {
        columns: [
          { key: "date", label: "Date", minWidth: "100px" },
          { key: "journalNo", label: "Journal No.", minWidth: "130px" },
          { key: "accountCode", label: "Account Code", minWidth: "130px" },
          { key: "accountName", label: "Account Name", minWidth: "180px" },
          { key: "description", label: "Description", minWidth: "220px" },
          { key: "remarks", label: "Remarks", minWidth: "180px" },
        ],
        rows: [],
      };

    case "R1L01":
      return {
        columns: [
          { key: "contractNumber", label: "Contract Number", minWidth: "120px" },
          { key: "borrowerName", label: "Borrower's Name", minWidth: "180px" },
          { key: "sched", label: "Sched", align: "center", minWidth: "80px" },
          { key: "hold", label: "Hold", align: "center", minWidth: "80px" },
          { key: "bank", label: "Bank", minWidth: "100px" },
          {
            key: "monthlyAmortization",
            label: "Monthly Amortization",
            align: "right",
            minWidth: "140px",
          },
          { key: "payment", label: "Payment", align: "right", minWidth: "120px" },
          {
            key: "delinquentUncollectedPayment",
            label: "Delinquent Uncollected Payment",
            align: "right",
            minWidth: "160px",
          },
          {
            key: "delinquentRemarks",
            label: "Delinquent Remarks / Other Remarks",
            minWidth: "190px",
          },
          { key: "firstDueDate", label: "First Due Date", align: "center", minWidth: "120px" },
          { key: "lastDueDate", label: "Last Due Date", align: "center", minWidth: "120px" },
        ],
        rows: [],
      };

    case "R1L02":
      return {
        columns: [
          { key: "loanType", label: "Loan Type", minWidth: "170px" },
          {
            key: "totalApplications",
            label: "Total Applications",
            align: "right",
            minWidth: "150px",
          },
          { key: "approved", label: "Approved", align: "right", minWidth: "120px" },
          { key: "pending", label: "Pending", align: "right", minWidth: "120px" },
          { key: "cancelled", label: "Cancelled", align: "right", minWidth: "120px" },
          { key: "totalAmount", label: "Total Amount", align: "right", minWidth: "140px" },
        ],
        rows: [],
      };

    case "R1L03":
      return {
        columns: [
          { key: "dateApplied", label: "Date Applied", minWidth: "120px" },
          { key: "applicationNo", label: "Application No.", minWidth: "140px" },
          { key: "borrowerName", label: "Borrower Name", minWidth: "180px" },
          { key: "loanType", label: "Loan Type", minWidth: "140px" },
          { key: "loanAmount", label: "Loan Amount", align: "right", minWidth: "140px" },
          { key: "chequeStatus", label: "Cheque Status", minWidth: "140px" },
          { key: "remarks", label: "Remarks", minWidth: "180px" },
        ],
        rows: [],
      };

    case "R1L04":
      return {
        columns: [
          { key: "releaseDate", label: "Release Date", minWidth: "120px" },
          { key: "applicationNo", label: "Application No.", minWidth: "140px" },
          { key: "borrowerName", label: "Borrower Name", minWidth: "180px" },
          { key: "loanType", label: "Loan Type", minWidth: "140px" },
          { key: "loanAmount", label: "Loan Amount", align: "right", minWidth: "140px" },
          { key: "chequeNo", label: "Cheque No.", minWidth: "120px" },
          { key: "releasedBy", label: "Released By", minWidth: "140px" },
        ],
        rows: [],
      };

    case "R1L05":
      return {
        columns: [
          { key: "date", label: "Date", minWidth: "80px" },
          { key: "newP", label: "P", align: "center", minWidth: "55px" },
          { key: "newA", label: "A", align: "center", minWidth: "55px" },
          { key: "newS", label: "S", align: "center", minWidth: "55px" },
          { key: "newB", label: "B", align: "center", minWidth: "55px" },
          { key: "oldRL", label: "RL", align: "center", minWidth: "55px" },
          { key: "oldLL", label: "LL", align: "center", minWidth: "55px" },
          { key: "oldAL", label: "AL", align: "center", minWidth: "55px" },
          { key: "oldEL", label: "EL", align: "center", minWidth: "55px" },
          { key: "oldXB", label: "XB", align: "center", minWidth: "55px" },
          { key: "ttl", label: "TTL", align: "center", minWidth: "65px" },
          { key: "principalRelease", label: "Release", align: "right", minWidth: "100px" },
          {
            key: "principalRunningBalance",
            label: "Running Balance",
            align: "right",
            minWidth: "120px",
          },
          { key: "netRelease", label: "Release", align: "right", minWidth: "100px" },
          {
            key: "netRunningBalance",
            label: "Running Balance",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "amountWithdrawn",
            label: "Amount Withdrawn",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "loanCurrentAccount",
            label: "Current Account",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "loanOverdueAccount",
            label: "Overdue Account",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "liqCurrentAccount",
            label: "Current Account",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "liqAdvancePayment",
            label: "Advance Payment",
            align: "right",
            minWidth: "120px",
          },
          { key: "bankCharge", label: "Bank Charge", align: "right", minWidth: "90px" },
          { key: "penalty", label: "Penalty", align: "right", minWidth: "90px" },
          { key: "refund", label: "Refund", align: "right", minWidth: "90px" },
          {
            key: "totalCollections",
            label: "Total Collections",
            align: "right",
            minWidth: "120px",
          },
          {
            key: "runningBalance",
            label: "Running Balance",
            align: "right",
            minWidth: "120px",
          },
        ],
        rows: [],
      };

    case "R1L06":
      return {
        columns: [
          { key: "dateDisapproved", label: "Date Disapproved", minWidth: "140px" },
          { key: "applicationNo", label: "Application No.", minWidth: "140px" },
          { key: "borrowerName", label: "Borrower Name", minWidth: "180px" },
          { key: "loanType", label: "Loan Type", minWidth: "140px" },
          { key: "loanAmount", label: "Loan Amount", align: "right", minWidth: "140px" },
          { key: "disapprovedBy", label: "Disapproved By", minWidth: "150px" },
          { key: "reason", label: "Reason", minWidth: "180px" },
        ],
        rows: [],
      };

    case "R1L07":
      return {
        columns: [
          { key: "clientId", label: "Client ID", minWidth: "110px" },
          { key: "clientName", label: "Client Name", minWidth: "170px" },
          { key: "refInvoice", label: "Ref. Invoice", minWidth: "130px" },
          { key: "dateDue", label: "Date & Due", minWidth: "130px" },
          {
            key: "loanPrincipal",
            label: "Loan Principal",
            align: "right",
            minWidth: "140px",
          },
          { key: "interest", label: "Interest", align: "right", minWidth: "110px" },
          { key: "days", label: "Days", align: "center", minWidth: "80px" },
          { key: "overdue030", label: "0-30 Days", align: "right", minWidth: "100px" },
          { key: "overdue3160", label: "31-60 Days", align: "right", minWidth: "110px" },
          { key: "overdue6190", label: "61-90 Days", align: "right", minWidth: "110px" },
          { key: "overdue91120", label: "91-120 Days", align: "right", minWidth: "110px" },
          {
            key: "overdueOver120",
            label: "Over 120 Days",
            align: "right",
            minWidth: "120px",
          },
          { key: "total", label: "TOTAL", align: "right", minWidth: "110px" },
        ],
        rows: [],
      };

    case "R1I01":
      return {
        columns: [
          { key: "requestDate", label: "Request Date", minWidth: "120px" },
          { key: "prNumber", label: "PR Number", minWidth: "130px" },
          { key: "department", label: "Department", minWidth: "150px" },
          { key: "requestedBy", label: "Requested By", minWidth: "150px" },
          { key: "status", label: "Status", minWidth: "110px" },
          { key: "remarks", label: "Remarks", minWidth: "180px" },
        ],
        rows: [],
      };

    case "R1I02":
      return {
        columns: [
          { key: "prNumber", label: "PR Number", minWidth: "130px" },
          { key: "requestDate", label: "Request Date", minWidth: "120px" },
          { key: "supplier", label: "Supplier", minWidth: "170px" },
          { key: "totalItems", label: "Total Items", align: "right", minWidth: "120px" },
          { key: "totalAmount", label: "Total Amount", align: "right", minWidth: "140px" },
          { key: "status", label: "Status", minWidth: "110px" },
        ],
        rows: [],
      };

    case "R1I03":
      return {
        columns: [
          { key: "itemCode", label: "Item Code", minWidth: "120px" },
          { key: "itemDescription", label: "Item Description", minWidth: "220px" },
          { key: "unit", label: "Unit", minWidth: "90px" },
          { key: "quantity", label: "Quantity", align: "right", minWidth: "110px" },
          { key: "requestDate", label: "Request Date", minWidth: "120px" },
          { key: "prNumber", label: "PR Number", minWidth: "130px" },
        ],
        rows: [],
      };

    case "R1000":
    case "R1S00":
    case "R2000":
    case "R2500":
      return {
        columns: [
          { key: "salesDate", label: "Sales Date", minWidth: "120px" },
          { key: "invoiceNo", label: "Invoice No.", minWidth: "130px" },
          { key: "customerName", label: "Customer Name", minWidth: "180px" },
          { key: "cashier", label: "Cashier", minWidth: "140px" },
          { key: "paymentType", label: "Payment Type", minWidth: "130px" },
          { key: "grossSales", label: "Gross Sales", align: "right", minWidth: "130px" },
          { key: "discount", label: "Discount", align: "right", minWidth: "110px" },
          { key: "netSales", label: "Net Sales", align: "right", minWidth: "130px" },
        ],
        rows: [],
      };

    case "R3000":
    case "R5500":
    case "R6500":
      return {
        columns: [
          { key: "salesDate", label: "Sales Date", minWidth: "120px" },
          { key: "itemCode", label: "Item Code", minWidth: "120px" },
          { key: "itemDescription", label: "Item Description", minWidth: "220px" },
          { key: "brand", label: "Brand", minWidth: "130px" },
          { key: "model", label: "Model", minWidth: "130px" },
          { key: "quantity", label: "Qty", align: "right", minWidth: "90px" },
          { key: "amount", label: "Amount", align: "right", minWidth: "130px" },
        ],
        rows: [],
      };

    case "R3500":
    case "R4000":
    case "R4500":
    case "R5000":
    case "R6000":
      return {
        columns: [
          { key: "salesDate", label: "Sales Date", minWidth: "120px" },
          { key: "category", label: "Category", minWidth: "160px" },
          { key: "description", label: "Description", minWidth: "220px" },
          { key: "staff", label: "Staff", minWidth: "140px" },
          { key: "marketSegment", label: "Market Segment", minWidth: "160px" },
          { key: "quantity", label: "Qty", align: "right", minWidth: "90px" },
          { key: "totalSales", label: "Total Sales", align: "right", minWidth: "140px" },
        ],
        rows: [],
      };

    default:
      return {
        columns: [
          { key: "date", label: "Date", minWidth: "100px" },
          { key: "reference", label: "Reference", minWidth: "140px" },
          { key: "description", label: "Description", minWidth: "220px" },
          { key: "remarks", label: "Remarks", minWidth: "180px" },
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
  const bodyBg = isDark ? "#101d3d" : "#ffffff";
  const bodyText = isDark ? "#f8fafc" : "#0f172a";
  const sheetBg = isDark ? "#101d3d" : "#ffffff";
  const sheetBorder = isDark ? "rgba(148, 163, 184, 0.38)" : "#d8dfea";
  const tableBorder = isDark ? "rgba(226, 232, 240, 0.72)" : "#cbd5e1";
  const headerBg = isDark ? "rgba(15, 23, 42, 0.58)" : "#f8fafc";
  const mutedColor = isDark ? "#cbd5e1" : "#64748b";
  const iconBorder = isDark ? "rgba(226, 232, 240, 0.25)" : "#d8dfea";

  const theadHtml = columns.some((c) => c.key === "newP")
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
            : "";

          return `<th class="${getAlignClass(column.align)}"${widthStyle}>${escapeHtml(
            column.label,
          )}</th>`;
        })
        .join("")}</tr>`;

  const tbodyHtml =
    rows.length > 0
      ? rows
          .map(
            (row) => `
              <tr>
                ${columns
                  .map((column) => {
                    const value = row[column.key] ?? "";
                    const widthStyle = column.minWidth
                      ? ` style="min-width:${column.minWidth}"`
                      : "";
                    return `<td class="${getAlignClass(
                      column.align,
                    )}"${widthStyle}>${escapeHtml(String(value))}</td>`;
                  })
                  .join("")}
              </tr>
            `,
          )
          .join("")
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
            min-width: ${columns.length >= 9 ? "1380px" : columns.length >= 7 ? "980px" : "780px"};
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
              min-width: ${columns.length >= 9 ? "1380px" : columns.length >= 7 ? "980px" : "680px"};
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

function buildAccountingPreviewHtml(
  reportName: string,
  sectionLabel: string,
  isDark: boolean,
) {
  const bodyBg = isDark ? "#0f172a" : "#ffffff";
  const bodyText = isDark ? "#e5e7eb" : "#111827";
  const sheetBg = isDark ? "#111827" : "#ffffff";
  const sheetBorder = isDark ? "#475569" : "#94a3b8";
  const lineColor = isDark ? "#cbd5e1" : "#000000";
  const subtitleColor = isDark ? "#94a3b8" : "#64748b";

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
            <div>
              <strong>Company Name</strong><br />
              Branch Name
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
                  <td colspan="6" style="text-align:center;padding:32px 8px;color:${subtitleColor};">
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

function buildInventoryPreviewHtml(
  reportName: string,
  sectionLabel: string,
  isDark: boolean,
) {
  const bodyBg = isDark ? "#0f172a" : "#ffffff";
  const bodyText = isDark ? "#e5e7eb" : "#111827";
  const sheetBg = isDark ? "#111827" : "#ffffff";
  const sheetBorder = isDark ? "#475569" : "#94a3b8";
  const lineColor = isDark ? "#cbd5e1" : "#000000";
  const subtitleColor = isDark ? "#94a3b8" : "#64748b";

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
            .table-wrap { overflow: visible; }
            table { min-width: 0; }
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
              <strong>Company Name</strong><br />
              Branch Name
              <div class="title"><h1>${escapeHtml(reportName)}</h1></div>
            </div>
            <div class="meta">
              Generated By<br />
              Page 1 of 1<br />
              Generated Date
            </div>
          </div>

          <div class="range">
            <strong>Transaction Date(s):</strong> Date range
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

function getAlignClass(align?: "left" | "center" | "right") {
  if (align === "center") return "center";
  if (align === "right") return "right";
  return "left";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
