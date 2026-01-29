'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authApi, User } from '@/lib/auth-api';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string, full_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const authRetryCount = useRef(0);

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

  const refreshUser = async () => {
    const currentPath = getCurrentPath();
    
    // Don't try to fetch user if we're on login/register page
    if (isAuthPage(currentPath)) {
      console.log('[Auth] refreshUser: On auth page, skipping');
      setUser(null);
      setLoading(false);
      return;
    }

    console.log('[Auth] refreshUser: Fetching user from API');
    try {
      const currentUser = await authApi.getCurrentUser();
      console.log('[Auth] refreshUser: Success, user:', currentUser.username);
      authRetryCount.current = 0;
      setUser(currentUser);
      setLoading(false);
    } catch (error) {
      console.log('[Auth] refreshUser: Error:', error);
      // Only clear user if we get a 401 (unauthorized) - this means session is invalid
      // For other errors, keep the user state to prevent false logouts
      const isUnauthorized = error instanceof Error && (
        error.message.includes('401') || 
        error.message.includes('Not authenticated') ||
        error.message.includes('Unauthorized')
      );
      if (isUnauthorized) {
        // Retry once to avoid transient 401s during backend restarts or cookie race conditions
        if (authRetryCount.current < 1) {
          authRetryCount.current += 1;
          console.log('[Auth] refreshUser: 401 - retrying once before clearing session');
          await new Promise(resolve => setTimeout(resolve, 500));
          return refreshUser();
        }
        console.log('[Auth] refreshUser: 401 - clearing user');
        if (typeof window !== 'undefined') {
          localStorage.removeItem('session_id');
        }
        setUser(null);
        setLoading(false);
      } else {
        // For network errors, keep user state and just set loading to false
        console.log('[Auth] refreshUser: Non-401 error, keeping user state');
        setLoading(false);
      }
    }
  };

  // Initial mount effect - always try to restore session on page load
  // This ensures session persists across page reloads
  useEffect(() => {
    const restoreSession = async () => {
      const currentPath = getCurrentPath();
      
      // If we're on an auth page, clear user and stop loading
      if (isAuthPage(currentPath)) {
        console.log('[Auth] Mount: On auth page, skipping restore');
        setUser(null);
        setLoading(false);
        return;
      }

      // Check if we have a stored session in localStorage
      const storedSessionId = typeof window !== 'undefined' ? localStorage.getItem('session_id') : null;
      console.log('[Auth] Mount: Attempting to restore session, path:', currentPath, 'has stored session:', !!storedSessionId);
      
      // On initial mount, ALWAYS try to restore session from localStorage/cookie
      // Even if we don't have localStorage, try the cookie
      try {
        await refreshUser();
        console.log('[Auth] Mount: Session restored successfully');
      } catch (error) {
        console.log('[Auth] Mount: Failed to restore session:', error);
        // If refresh fails, clear localStorage and set loading to false
        if (typeof window !== 'undefined') {
          localStorage.removeItem('session_id');
        }
        setLoading(false);
      }
    };
    
    // Small delay to ensure pathname is available
    const timer = setTimeout(() => {
      restoreSession();
    }, 50);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Effect for pathname changes - don't refetch if we already have a user
  useEffect(() => {
    // Skip if this is the initial mount (handled by the mount effect above)
    if (loading && user === null) {
      return;
    }
    
    const currentPath = getCurrentPath();
    
    // Skip API call on login/register pages
    if (isAuthPage(currentPath)) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Only fetch if we don't have a user and we're not on an auth page
    // This prevents unnecessary API calls during navigation when user is already set
    if (currentPath && !isAuthPage(currentPath) && !user) {
      refreshUser();
    } else if (user) {
      // We already have a user - trust the existing session
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const login = async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setUser(result.user);
    setLoading(false);
    // Small delay to ensure cookie is set before navigation
    await new Promise(resolve => setTimeout(resolve, 100));
    router.push('/');
  };

  const register = async (username: string, password: string, email?: string, full_name?: string) => {
    await authApi.register(username, password, email, full_name);
    // Auto-login after registration
    await login(username, password);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
