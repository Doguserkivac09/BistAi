import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'İzleme listenizi ve kayıtlı sinyallerinizi yönetin.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
