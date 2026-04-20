'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  Building2,
  HandCoins,
  Boxes,
  ShoppingCart,
} from 'lucide-react';
import { useSelectedLayoutSegment } from 'next/navigation';

import { reportsData } from './reports-data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const icons = {
  accounting: Building2,
  loan: HandCoins,
  inventory: Boxes,
  sales: ShoppingCart,
};

export default function ReportsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentCategory = useSelectedLayoutSegment();

  const selectedGroup = reportsData.find((g) => g.key === currentCategory);
  const groupsToShow = selectedGroup ? [selectedGroup] : reportsData;

  return (
    <main className="min-h-screen bg-[#f3f4f6] text-slate-900 dark:bg-[#020b24] dark:text-white">
      {!currentCategory && (
        <div className="border-b border-[#d8dfea] bg-[#f8f8f9] dark:border-white/10 dark:bg-[#071330]">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                asChild
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 rounded-full border-[#cfd6e4] bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Link href="/dashboard">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>

              <div className="min-w-0">
                <h1 className="text-2xl font-semibold leading-none tracking-tight text-slate-900 dark:text-white sm:text-[32px]">
                  Reports
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Browse and choose a report type
                </p>
              </div>
            </div>

            <div className="hidden rounded-full bg-[#f5e1c9] px-4 py-1.5 text-xs font-medium text-[#d45500] dark:bg-[#2b1c1c] dark:text-orange-300 sm:block">
              Reports Menu
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-8 sm:px-6 sm:pt-10 sm:pb-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <aside className="w-full lg:w-[260px] lg:shrink-0">
            <Card className="rounded-3xl border border-[#cfd6e4] bg-[#f8f8f9] shadow-none dark:border-white/10 dark:bg-[#0b1733]">
              <CardContent className="p-5 sm:p-7">
                <div className="mb-6 flex items-center gap-3 sm:mb-7">
                  {currentCategory && (
                    <Button
                      asChild
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 shrink-0 rounded-full border-[#cfd6e4] bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white dark:hover:bg-white/5 dark:hover:text-white"
                    >
                      <Link href="/dashboard/reports">
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}

                  <h2 className="min-w-0 font-semibold text-slate-900 dark:text-white">
                    {selectedGroup?.label || 'Report Groups'}
                  </h2>
                </div>

                <div className="space-y-5 sm:space-y-6">
                  {groupsToShow.map((group) => {
                    const Icon = icons[group.key as keyof typeof icons] || Building2;
                    const isActive = group.key === currentCategory;

                    const iconClass =
                      group.key === 'accounting'
                        ? isActive
                          ? 'border-[#bcd0ff] bg-[#e8f0ff] text-[#2563eb] dark:border-blue-500/50 dark:bg-[#132a68] dark:text-[#7cb3ff]'
                          : 'border-[#cfe0ff] bg-[#eef4ff] text-[#2563eb] dark:border-white/10 dark:bg-[#101d3d] dark:text-[#7cb3ff]'
                        : group.key === 'loan'
                        ? isActive
                          ? 'border-[#b8efd7] bg-[#e9fbf2] text-[#059669] dark:border-emerald-500/40 dark:bg-[#0f2b24] dark:text-[#34d399]'
                          : 'border-[#b8efd7] bg-[#eefcf5] text-[#059669] dark:border-white/10 dark:bg-[#10211c] dark:text-[#6ee7b7]'
                        : group.key === 'inventory'
                        ? isActive
                          ? 'border-[#ffd5b5] bg-[#fff1e7] text-[#ea580c] dark:border-orange-500/40 dark:bg-[#2c1a10] dark:text-[#fb923c]'
                          : 'border-[#ffd5b5] bg-[#fff5ed] text-[#ea580c] dark:border-white/10 dark:bg-[#24170f] dark:text-[#fdba74]'
                        : isActive
                        ? 'border-[#dfc6ff] bg-[#f5edff] text-[#9333ea] dark:border-violet-500/40 dark:bg-[#25143a] dark:text-[#c084fc]'
                        : 'border-[#dfc6ff] bg-[#f8f1ff] text-[#9333ea] dark:border-white/10 dark:bg-[#21152d] dark:text-[#d8b4fe]';

                    return (
                      <Link
                        key={group.key}
                        href={`/dashboard/reports/${group.key}`}
                        className="block"
                      >
                        <div
                          className={`flex items-center justify-between rounded-[22px] border px-4 py-4 transition sm:px-5 sm:py-5 ${
                            isActive
                              ? 'border-orange-500 bg-white dark:border-orange-500/70 dark:bg-[#101d3d]'
                              : 'border-[#d8dfea] bg-[#f8f8f9] hover:bg-[#eef1f6] dark:border-white/10 dark:bg-[#0d1936] dark:hover:bg-[#122147]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border sm:h-12 sm:w-12 ${iconClass}`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900 dark:text-white">
                                {group.label}
                              </p>
                              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:mt-1.5">
                                {group.sections.length} section
                                {group.sections.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </aside>

          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </div>
    </main>
  );
}