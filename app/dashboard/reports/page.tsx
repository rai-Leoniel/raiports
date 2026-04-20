import { Card, CardContent } from '@/components/ui/card';

export default function ReportsPage() {
  return (
    <Card className="rounded-3xl border border-dashed border-[#cfd6e4] bg-transparent shadow-none dark:border-white/10">
      <CardContent className="flex min-h-[420px] items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Select a report group
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Choose Accounting, Loan, or Inventory from the left sidebar.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}