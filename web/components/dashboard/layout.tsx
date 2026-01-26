'use client';

import { useAuth } from '@/contexts/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Header } from './header';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if we're not already on login/register and auth check is complete
    if (!loading && !user && pathname !== '/login' && pathname !== '/register') {
      router.push('/login');
    }
  }, [user, loading, pathname, router]);

  // Don't show layout on login/register pages - render children directly without any wrapper
  if (pathname === '/login' || pathname === '/register') {
    return <>{children}</>;
  }

  // Show loading state only if we're not on login/register
  if (loading && pathname !== '/login' && pathname !== '/register') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (but allow login/register pages)
  if (!user && pathname !== '/login' && pathname !== '/register') {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="px-24 mx-auto max-w-[1920px] py-12">
          {children}
        </div>
      </main>
    </div>
  );
}
