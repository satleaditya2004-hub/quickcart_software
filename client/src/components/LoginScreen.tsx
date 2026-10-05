import React, { useState } from 'react';
import { ShoppingCart, Lock, Mail, ArrowRight, ShieldCheck, BarChart3, AlertCircle, MonitorPlay } from 'lucide-react';
import { api } from '../api';
import type { User, Role } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  onOpenDisplay?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onOpenDisplay }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email or password is incorrect.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Email or password is incorrect.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (role: Role) => {
    setError(null);
    if (role === 'admin') {
      setEmail('admin@quickkart.com');
      setPassword('admin123');
    } else if (role === 'staff') {
      setEmail('staff@quickkart.com');
      setPassword('staff123');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#F3F7F7] dark:bg-[#0B1313]">
      <div className="w-full max-w-4xl bg-white dark:bg-[#132220] rounded-2xl shadow-xl border border-gray-200/80 dark:border-teal-900/50 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        
        {/* Left Panel: Deep Teal Brand Showcase */}
        <div className="bg-gradient-to-br from-teal-800 to-teal-950 p-8 sm:p-10 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-teal-600/20 rounded-full blur-2xl" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl" />

          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-teal-700/60 border border-teal-500/40 flex items-center justify-center shadow-lg">
                <ShoppingCart className="w-6 h-6 text-teal-200" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white">
                  Quick<span className="text-amber-400">Kart</span>
                </h1>
                <p className="text-xs text-teal-300 font-medium tracking-wide">
                  Shopping Mall Software + Digital Display
                </p>
              </div>
            </div>

            <p className="text-sm text-teal-100/90 leading-relaxed mb-8">
              Connected mall inventory suite. Customers scan items on kiosk touch displays with 360° rotating photos and pay on the spot. Admin and staff track stock, sales, and customer purchases with AI analytics.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-teal-700/40 border border-teal-600/30 text-teal-300 mt-0.5">
                  <MonitorPlay className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Customer Digital Touch Displays</h4>
                  <p className="text-[11px] text-teal-200/80">Self-checkout kiosk with rotating product photos & WhatsApp receipts.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-teal-700/40 border border-teal-600/30 text-teal-300 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Admin Customers Intelligence</h4>
                  <p className="text-[11px] text-teal-200/80">Complete record of customer phone numbers, barcodes bought, and time.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-teal-700/40 border border-teal-600/30 text-amber-300 mt-0.5">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Live Sync Across Mall & Displays</h4>
                  <p className="text-[11px] text-teal-200/80">Stock updates instantly on all screens the second a payment finishes.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-teal-700/50 flex items-center justify-between text-xs text-teal-300/80">
            <span>QuickKart Mall v2.0</span>
            {onOpenDisplay && (
              <button
                type="button"
                onClick={onOpenDisplay}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30 transition-all font-semibold"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                <span>Launch Display Kiosk</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Panel: Login Form (Admin & Staff Only) */}
        <div className="p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Mall Software Login</h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                Admin & Staff portal. (Customers use the Digital Display App).
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-red-700 dark:text-red-300 text-xs font-medium animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@quickkart.com or staff@quickkart.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-semibold text-sm shadow-md shadow-teal-700/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign in to Mall Software
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Quick Demo Switcher (Admin & Staff Only per C3 & 2.5) */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2.5 text-center">
              Quick Role Switcher
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectDemoAccount('admin')}
                className="py-2 px-3 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 hover:bg-amber-100/60 transition-colors text-center"
              >
                Mall Admin
                <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                  List, Data, Sell, Analysis, Customers (No Scanner)
                </span>
              </button>

              <button
                type="button"
                onClick={() => selectDemoAccount('staff')}
                className="py-2 px-3 text-xs font-medium rounded-lg border border-teal-300 dark:border-teal-800/80 bg-teal-50/60 dark:bg-teal-950/30 text-teal-900 dark:text-teal-300 hover:bg-teal-100/60 transition-colors text-center"
              >
                Mall Staff
                <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                  List, Scan Tab (Stock-In & Feed), Data, Sell, Analysis
                </span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
