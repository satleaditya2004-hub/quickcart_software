import { useState, useEffect } from 'react';
import type { User } from './types';
import { ToastProvider } from './context/ToastContext';
import { SplashScreen } from './components/SplashScreen';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import type { TabType } from './components/Header';
import { ListTab } from './components/ListTab';
import { ScanTab } from './components/ScanTab';
import { DataTab } from './components/DataTab';
import { SellTab } from './components/SellTab';
import { AnalysisTab } from './components/AnalysisTab';
import { CustomersTab } from './components/CustomersTab';
import { DigitalDisplay } from './components/DigitalDisplay';

export function App() {
  const [hasSplashed, setHasSplashed] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('quickkart_dark') === 'true' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [infoProductId, setInfoProductId] = useState<string | null>(null);
  const [isDisplayMode, setIsDisplayMode] = useState<boolean>(() => {
    // Auto-launch display mode if URL path is /display
    return window.location.pathname === '/display';
  });

  // Check stored user session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('quickkart_user');
    const storedToken = localStorage.getItem('quickkart_access_token');
    if (storedUser && storedToken) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        // Admin defaults to list, Staff defaults to scan
        if (parsed.role === 'staff') {
          setActiveTab('scan');
        } else {
          setActiveTab('list');
        }
      } catch (e) {
        localStorage.removeItem('quickkart_user');
      }
    }

    const handleAuthChange = () => {
      const u = localStorage.getItem('quickkart_user');
      if (!u) setUser(null);
    };

    window.addEventListener('quickkart:auth-change', handleAuthChange);
    return () => window.removeEventListener('quickkart:auth-change', handleAuthChange);
  }, []);

  // Sync dark class on document root
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('quickkart_dark', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('quickkart_dark', 'false');
    }
  }, [isDark]);

  const toggleDark = () => {
    setIsDark(prev => !prev);
  };

  const handleSplashComplete = () => {
    setHasSplashed(true);
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    if (loggedInUser.role === 'staff') {
      setActiveTab('scan');
    } else {
      setActiveTab('list');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('quickkart_access_token');
    localStorage.removeItem('quickkart_refresh_token');
    localStorage.removeItem('quickkart_user');
    setUser(null);
  };

  const handleOpenDisplay = () => {
    setIsDisplayMode(true);
  };

  const handleExitDisplay = () => {
    setIsDisplayMode(false);
    // If URL was /display, navigate back to root
    if (window.location.pathname === '/display') {
      window.history.pushState({}, '', '/');
    }
  };

  // Digital Display Mode — full-screen kiosk, no login needed
  if (isDisplayMode) {
    return (
      <ToastProvider>
        <DigitalDisplay onExitDisplay={handleExitDisplay} />
      </ToastProvider>
    );
  }

  // 1. Show Splash Screen if first launch
  if (!hasSplashed) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // 2. Show Login Screen if no active authenticated user
  if (!user) {
    return (
      <ToastProvider>
        <LoginScreen onLoginSuccess={handleLoginSuccess} onOpenDisplay={handleOpenDisplay} />
      </ToastProvider>
    );
  }

  // 3. Show Main QuickKart Mall Software
  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F3F7F7] dark:bg-[#0B1313] flex flex-col text-[#0F1F1E] dark:text-[#E2E8F0]">
        
        {/* Persistent Header with Navigation Tabs, Bell & Sign Out */}
        <Header
          user={user}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLogout={handleLogout}
          isDark={isDark}
          onToggleDark={toggleDark}
          onSelectProductForInfo={(prodId) => {
            setInfoProductId(prodId);
            setActiveTab('list');
          }}
          onOpenDisplay={handleOpenDisplay}
        />

        {/* Tab Content Container */}
        <main className="flex-1 max-w-[1240px] w-full mx-auto p-4 sm:p-6 pb-12">
          {activeTab === 'list' && (
            <ListTab 
              initialInfoProductId={infoProductId} 
              onClearInfoProductId={() => setInfoProductId(null)} 
            />
          )}

          {activeTab === 'scan' && <ScanTab />}

          {activeTab === 'data' && <DataTab />}

          {activeTab === 'sell' && <SellTab />}

          {activeTab === 'analysis' && <AnalysisTab />}

          {activeTab === 'customers' && <CustomersTab />}
        </main>

      </div>
    </ToastProvider>
  );
}

export default App;
