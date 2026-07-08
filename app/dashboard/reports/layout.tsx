import ReportsShell from './ReportsShell';

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReportsShell>{children}</ReportsShell>;
}