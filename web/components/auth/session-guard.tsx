'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

const AUTH_PATHS = new Set(['/login', '/register']);
const MIN_RECHECK_MS = 30_000;

const normalizePath = (path: string | null) => {
  if (!path) return '';
  return path.replace(/\/$/, '') || '/';
};

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const pathname = usePathname();
  const lastCheckRef = useRef(0);

  const shouldSkip = () => AUTH_PATHS.has(normalizePath(pathname));

  const maybeRefresh = async () => {
    const now = Date.now();
    if (now - lastCheckRef.current < MIN_RECHECK_MS) return;
    lastCheckRef.current = now;
    try {
      await refreshUser();
    } catch {
      // refreshUser already handles auth state updates
    }
  };

  useEffect(() => {
    if (shouldSkip() || loading) return;
    const hasSessionId = typeof window !== 'undefined' && !!localStorage.getItem('session_id');
    if (!user || !hasSessionId) {
      void maybeRefresh();
    }
  }, [pathname, user, loading]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !shouldSkip()) {
        void maybeRefresh();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'session_id') return;
      if (shouldSkip()) return;
      void maybeRefresh();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return <>{children}</>;
}
