'use client';

import { AuthGuard } from '@/components/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function CategoryPage() {
  return (
    <AuthGuard>
      <CategoryContent />
    </AuthGuard>
  );
}

function CategoryContent() {
  const params = useParams();
  const category = params.category as string;

  const formatCategoryName = (slug: string) => {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const categoryName = formatCategoryName(category);

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
            <h1 className="font-bold text-lg dark:text-white">{categoryName}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            {categoryName}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            View all transactions for {categoryName.toLowerCase()}
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white">{categoryName} List</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600 dark:text-slate-400">
                <p>This is a placeholder page for {categoryName} transactions.</p>
                <p>Here you can view, filter, and manage all pending {categoryName.toLowerCase()} requests with options to approve, reject, or forward for further review.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
