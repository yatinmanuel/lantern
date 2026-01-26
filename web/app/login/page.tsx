'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { login, refreshUser } = useAuth();

  useEffect(() => {
    console.log('Theme changed to:', theme);
  }, [theme]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use the auth context's login method which handles state updates and redirect
      await login(username, password);
      // The login method already sets the user and redirects, so we don't need to do anything else
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="relative w-full max-w-[480px] flex flex-col">
        <Card className="w-full flex flex-col shadow-xl border-0 bg-card rounded-xl">
          <CardHeader className="text-left space-y-0 pt-2 pb-1.5 px-6">
            <CardTitle className="text-2xl font-bold tracking-tight text-card-foreground">Lantern</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-0.5">Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-1.5">
            {error && (
              <div className="mb-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-2" id="login-form">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">Email</Label>
                <Input
                  id="email"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  placeholder="Enter your email"
                  className="h-9"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="h-9"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSubmit(e as any);
                    }
                  }}
                />
              </div>

              <div className="flex justify-end pt-0.5">
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-9 px-5 text-sm font-medium"
                  size="lg"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Footer elements below card */}
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Built by Yatin Manuel</p>
          <Button
            onClick={toggleTheme}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            {theme === 'dark' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
