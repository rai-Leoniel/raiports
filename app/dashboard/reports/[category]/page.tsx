import { notFound } from 'next/navigation';
import { reportsData } from '../reports-data';
import CategoryPanel from './CategoryPanel';

type PageProps = {
  params: Promise<{
    category: string;
  }>;
};

export default async function ReportsCategoryPage({ params }: PageProps) {
  const { category: categoryKey } = await params;

  const category = reportsData.find((item) => item.key === categoryKey);

  if (!category) {
    notFound();
  }

  return <CategoryPanel category={category} />;
}