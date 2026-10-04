import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, 
  Bell, 
  LogOut, 
  Moon, 
  Sun, 
  AlertTriangle, 
  ChevronRight, 
  Shield, 
  UserCheck, 
  MonitorPlay,
  Users
} from 'lucide-react';
import type { User, Role, LowStockAlertItem } from '../types';
import { api } from '../api';
import { socket } from '../socket';

export type TabType = 'list' | 'scan' | 'data' | 'sell' | 'analysis' | 'customers';

interface HeaderProps {
  user: User;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  onSelectProductForInfo?: (productId: string) => void;
  onOpenDisplay?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  onTabChange,
  onLogout,
  isDark,
  onToggleDark,
  onSelectProductForInfo,
  onOpenDisplay
}) => {
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlertItem[]>([]);
  const [recentPurchasesCount, setRecentPurchasesCount] = useState<number>(0);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setLowStockAlerts(data.lowStock.items);
      setRecentPurchasesCount(data.recentPurchases.count);
    } catch (error) {
      console.error('Unable to load notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handlePurchase = () => {
      fetchNotifications();
    };

    const handleStockLow = (data: { count: number; items: LowStockAlertItem[] }) => {
      setLowStockAlerts(data.items);
    };

    socket.on('purchase:completed', handlePurchase);
    socket.on('alert:purchase', handlePurchase);
    socket.on('stock:low', handleStockLow);
    socket.on('unit:stocked', fetchNotifications);
    socket.on('unit:sold', fetchNotifications);

    return () => {
      socket.off('purchase:completed', handlePurchase);
      socket.off('alert:purchase', handlePurchase);
      socket.off('stock:low', handleStockLow);
      socket.off('unit:stocked', fetchNotifications);
      socket.off('unit:sold', fetchNotifications);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tabs based on user role (C5 & 2.5: Admin NEVER sees a scanner, a barcode input or the Scan tab)
  const allTabs: { id: TabType; label: string; roles: Role[] }[] = [
    { id: 'list', label: 'List', roles: ['admin', 'staff'] },
    { id: 'scan', label: 'Scan', roles: ['staff'] }, // STAFF ONLY
    { id: 'data', label: 'Data', roles: ['admin', 'staff'] },
    { id: 'sell', label: 'Sell', roles: ['admin', 'staff'] },
    { id: 'analysis', label: 'Analysis', roles: ['admin', 'staff'] },
    { id: 'customers', label: 'Customers', roles: ['admin'] } // ADMIN ONLY
  ];

  const visibleTabs = allTabs.filter(t => t.roles.includes(user.role));

  const roleBadges: Record<Role, { label: string; icon: any; color: string }> = {
    admin: { label: 'Mall Admin', icon: Shield, color: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
    staff: { label: 'Mall Staff', icon: UserCheck, color: 'bg-teal-500/20 text-teal-200 border-teal-400/40' }
  };

  const RoleIcon = roleBadges[user.role].icon;
  const totalAlertCount = lowStockAlerts.length + (user.role === 'admin' ? recentPurchasesCount : 0);

  return (
    <header className="bg-teal-800 text-white shadow-md sticky top-0 z-40 transition-colors">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Left: Brand Logo & Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-teal-700/80 border border-teal-500/40 flex items-center justify-center shadow-inner">
              <ShoppingCart className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">Quick<span className="text-amber-400">Kart</span></span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${roleBadges[user.role].color}`}>
                  <RoleIcon className="w-3 h-3" />
                  {roleBadges[user.role].label}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Navigation Tabs (Active tab has Amber underline) */}
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative px-3.5 py-2 text-sm font-semibold tracking-wide rounded-md transition-all whitespace-nowrap ${
                    isActive 
                      ? 'text-white bg-teal-700/60 shadow-sm' 
                      : 'text-teal-200/80 hover:text-white hover:bg-teal-700/30'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions: Launch Display Button, Bell, Dark Mode, Logout */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* Direct Button to Launch/Toggle Customer Digital Display */}
            {onOpenDisplay && (
              <button
                type="button"
                onClick={onOpenDisplay}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-teal-950 shadow-sm transition-all"
                title="Open customer-facing touchscreen kiosk display"
              >
                <MonitorPlay className="w-4 h-4 fill-current" />
                <span>Customer Display</span>
              </button>
            )}

            {/* Notification Bell */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative p-2 rounded-lg text-teal-200 hover:text-white hover:bg-teal-700/60 transition-colors focus:outline-none"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {totalAlertCount > 0 && (
                  <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full ring-2 ring-teal-800 animate-in zoom-in-50 duration-200">
                    {totalAlertCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {isBellOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#132220] rounded-xl shadow-2xl border border-gray-200 dark:border-teal-900/60 overflow-hidden text-gray-900 dark:text-gray-100 z-50 animate-in fade-in-50 slide-in-from-top-2 duration-150">
                  <div className="p-3.5 bg-gray-50 dark:bg-teal-950/40 border-b border-gray-100 dark:border-teal-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        Alerts & Notifications
                      </h4>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-teal-900/30">
                    {/* Admin Recent Purchases notification */}
                    {user.role === 'admin' && recentPurchasesCount > 0 && (
                      <div 
                        onClick={() => {
                          onTabChange('customers');
                          setIsBellOpen(false);
                        }}
                        className="p-3 bg-teal-50/50 dark:bg-teal-950/40 hover:bg-teal-100/50 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-teal-600" />
                          <div>
                            <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
                              {recentPurchasesCount} New Customer Purchase(s)
                            </p>
                            <p className="text-[11px] text-teal-700 dark:text-teal-300">
                              Click to view customer phone & barcode records
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-teal-500" />
                      </div>
                    )}

                    {/* Low Stock Alerts */}
                    {lowStockAlerts.length === 0 && (user.role !== 'admin' || recentPurchasesCount === 0) ? (
                      <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                        No active alerts at this moment.
                      </div>
                    ) : (
                      lowStockAlerts.map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (onSelectProductForInfo) onSelectProductForInfo(item.id);
                            setIsBellOpen(false);
                          }}
                          className="p-3 hover:bg-teal-50/50 dark:hover:bg-teal-900/20 cursor-pointer transition-colors flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              Barcode: {item.barcode} · ₹{item.selling_price}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                              {item.stock_count} in stock
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={onToggleDark}
              className="p-2 rounded-lg text-teal-200 hover:text-white hover:bg-teal-700/60 transition-colors focus:outline-none"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-300" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Sign Out Button */}
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-100 hover:text-white bg-teal-700/50 hover:bg-teal-700 border border-teal-600/40 transition-all shadow-sm"
              title="Sign out of QuickKart Mall"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
