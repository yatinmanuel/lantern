'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navigation = [
  { name: 'Overview', href: '/' },
  { name: 'Clients', href: '/servers' },
  { name: 'Boot Config', href: '/boot-config' },
  { name: 'Images', href: '/images' },
  { name: 'Queue', href: '/queue' },
  { name: 'Settings', href: '/settings' },
];

export function Header() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-border/40 bg-background">
      <div className="px-24 mx-auto max-w-[1920px]">
        {/* Top bar with logo and user info */}
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 76 65"
              className="h-5 w-5 fill-foreground"
            >
              <path d="M37.59 0L75.18 65H0L37.59 0z" />
            </svg>
            <h1 className="text-lg font-bold text-foreground">Lantern</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-auto py-1.5 px-3 hover:bg-accent">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white text-xs font-semibold">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-sm font-medium">{user?.full_name || user?.username || 'User'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Horizontal navigation tabs */}
        <nav className="flex items-center gap-8">
          {navigation.filter((item) => !['Queue', 'Settings'].includes(item.name)).map((item) => {
            const isActive = item.href === '/' 
              ? pathname === '/' 
              : pathname.startsWith(item.href);
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'relative pb-3.5 text-sm transition-colors',
                  isActive
                    ? 'font-bold text-foreground'
                    : 'font-normal text-muted-foreground hover:text-foreground'
                )}
              >
                {item.name}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
                )}
              </Link>
            );
          })}
          <div className="ml-auto flex items-center gap-8">
            {navigation.filter((item) => ['Queue', 'Settings'].includes(item.name)).map((item) => {
              const isActive = item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'relative pb-3.5 text-sm transition-colors',
                    isActive
                      ? 'font-bold text-foreground'
                      : 'font-normal text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.name}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
