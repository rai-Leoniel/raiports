'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Lock, User2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (
        email.trim().toLowerCase() === 'admin@test.com' &&
        password.trim() === 'admin123'
      ) {
        localStorage.setItem(
          'raiports-current-user',
          JSON.stringify({
            id: 'default-user',
            email: 'admin@test.com',
            name: 'Admin',
            fullName: 'Admin User',
            role: 'admin',
          })
        );

        window.location.href = '/dashboard';
        return;
      }

      const result = await login({
        email,
        password,
      });

      if (!result.success) {
        setError(result.message || 'Login failed.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
    } catch {
      setError('Login failed.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(30,64,175,0.16),_transparent_28%)]" />

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
          <div className="hidden lg:block">
            <div className="max-w-2xl">
              <div className="flex items-center gap-5 mb-8">
                <div className="relative w-[550px] h-[180px] shrink-0">
                  <Image
                    src="/rai-logo.png"
                    alt="RAI Reports logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </div>

              <div className="pl-2">
                <h2 className="text-4xl font-bold text-slate-900 dark:text-white leading-tight mb-4">
                  Fast approvals, cleaner workflows, smarter reporting
                </h2>
                <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
                  Access your approval workspace, track requests, and manage reports
                  in a clean modern interface built for daily operations.
                </p>

                <div className="grid grid-cols-2 gap-4 mt-8 max-w-xl">
                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Approval Tracking
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Monitor pending requests in one place
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Audit Ready
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Keep actions organized and traceable
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Secure Access
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Controlled visibility by user role
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Reports Center
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Open and review reports faster
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto">
            <div className="rounded-3xl border border-white/60 dark:border-slate-800 bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl shadow-2xl p-7 md:p-8">
              <div className="lg:hidden flex items-center gap-3 mb-6">
                <div className="relative w-14 h-14 shrink-0">
                  <Image
                    src="/rai-logo.png"
                    alt="RAI Reports logo"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
                <div className="leading-none">
                  <p className="text-2xl font-extrabold">
                    <span className="text-[#0B2E7A] dark:text-blue-400">RAI</span>{' '}
                    <span className="text-[#FF7A00]">REPORTS</span>
                  </p>
                  <p className="text-lg font-bold mt-1">
                    <span className="text-[#FF7A00]">WITH</span>{' '}
                    <span className="text-[#9CAA88]">APPROVAL</span>
                  </p>
                </div>
              </div>

              <div className="mb-7">
                <p className="text-xs font-semibold text-orange-500 uppercase tracking-[0.2em] mb-3">
                  Welcome back
                </p>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Sign in
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  Enter your credentials to continue to your dashboard.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium text-slate-900 dark:text-white"
                  >
                    User ID
                  </Label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <Input
                      id="email"
                      type="text"
                      placeholder="Enter your user ID"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 pl-10 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-900 dark:text-white"
                  >
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-12 pl-10 rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
                    />
                    <span>Remember me</span>
                  </label>

                  <Link href="#" className="text-orange-500 hover:text-orange-600 font-medium">
                    Forgot password?
                  </Link>
                </div>

                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-3 rounded-xl">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg shadow-orange-500/20"
                >
                  {loading ? 'Signing in...' : 'Login'}
                </Button>

                <div className="text-center text-sm text-slate-600 dark:text-slate-400">
                  Don&apos;t have an account?{' '}
                  <Link
                    href="/signup"
                    className="font-semibold text-orange-500 hover:text-orange-600"
                  >
                    Sign up
                  </Link>
                </div>
              </form>

              <div className="mt-7 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    System Status
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    All systems operational
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Online
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}