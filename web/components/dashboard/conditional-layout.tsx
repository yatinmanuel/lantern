'use client';

import { useAuth } from '@/contexts/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Header } from './header';

export function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Get current path - use window.location as fallback for immediate check
  // This works even on initial render since window is available on client
  const getCurrentPath = () => {
    let path = pathname;
    if (!path && typeof window !== 'undefined' && window.location) {
      path = window.location.pathname;
    }
    // Normalize path - remove trailing slash and ensure it starts with /
    if (path) {
      path = path.replace(/\/$/, '') || '/';
    }
    return path || '';
  };

  const isAuthPage = (path: string) => {
    const normalized = path.replace(/\/$/, '') || '/';
    return normalized === '/login' || normalized === '/register';
  };

  const currentPath = getCurrentPath();

  // All hooks must be called before any conditional returns
  useEffect(() => {
    // Only redirect if we're not already on login/register and auth check is complete
    // Add a longer delay to allow session restoration from localStorage to complete
    if (!loading && !user && !isAuthPage(currentPath)) {
      // Check if we have a session_id in localStorage - if so, give more time for restoration
      const hasStoredSession = typeof window !== 'undefined' && localStorage.getItem('session_id');
      const delay = hasStoredSession ? 1000 : 500; // Give more time if we have a stored session
      
      const timer = setTimeout(() => {
        // Double-check conditions before redirecting
        // This prevents redirecting during navigation transitions
        const stillNoUser = !user;
        const stillNotAuthPage = !isAuthPage(getCurrentPath());
        if (stillNoUser && stillNotAuthPage) {
          console.log('[ConditionalLayout] Redirecting to login - no user after delay');
          router.push('/login');
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [user, loading, currentPath, router]);

  // Don't wrap login/register pages with dashboard layout - return immediately
  // This check must happen AFTER all hooks
  if (isAuthPage(currentPath)) {
    return <>{children}</>;
  }

  // Show loading state only for non-login/register pages
  if (loading && !isAuthPage(currentPath)) {
    return (
      <div style={{ 
        display: 'flex', 
        height: '100vh', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (but allow login/register pages)
  if (!user && !isAuthPage(currentPath)) {
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
