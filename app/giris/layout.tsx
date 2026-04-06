import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Giriş Yap',
  description: 'Investable Edge hesabınıza giriş yapın ve hisse senedi sinyallerinizi takip edin.',
};

export default function GirisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
