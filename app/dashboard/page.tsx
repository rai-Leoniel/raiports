'use client';

import { getTenant } from '@/lib/api-config';
import { ApprovalsDashboard } from '@/components/ApprovalsDashboard';
import { CarRentDashboard } from '@/components/CarRentDashboard';

export default function DashboardPage() {
  const tenant = getTenant();

  if (tenant === 'sublet') {
    return <CarRentDashboard />;
  }

  return <ApprovalsDashboard />;
}