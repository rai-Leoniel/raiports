'use client';

import { AuthGuard } from '@/components/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function HistoryPage() {
  return (
    <AuthGuard>
      <HistoryContent />
    </AuthGuard>
  );
}

function HistoryContent() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="outline" size="icon" className="rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </Button> 
            </Link>
            <h1 className="font-bold text-lg dark:text-white">Transaction History</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Transaction History
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            View all past transactions and approvals
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600 dark:text-slate-400">
                <p>This is a placeholder page for Transaction History.</p>
                <p>Here you can display a complete history of all submitted transactions, their approval status, and timestamps.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
