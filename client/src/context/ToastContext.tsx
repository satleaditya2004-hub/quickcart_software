import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: ToastItem = { ...toast, id };
    setToasts(prev => [...prev.slice(-4), newToast]); // keep max 5 toasts

    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3500);
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4">
        {toasts.map(toast => {
          let bgClass = 'bg-white dark:bg-gray-800 border-teal-500 text-teal-900 dark:text-teal-100';
          let icon = <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />;

          if (toast.type === 'error') {
            bgClass = 'bg-white dark:bg-gray-800 border-red-500 text-red-900 dark:text-red-100';
            icon = <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-white dark:bg-gray-800 border-amber-500 text-amber-900 dark:text-amber-100';
            icon = <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />;
          } else if (toast.type === 'info') {
            bgClass = 'bg-white dark:bg-gray-800 border-blue-500 text-blue-900 dark:text-blue-100';
            icon = <Info className="w-5 h-5 text-blue-600 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto border-l-4 shadow-xl rounded-lg p-3.5 flex items-start gap-3 transition-all transform animate-in slide-in-from-bottom-2 duration-200 ${bgClass}`}
            >
              {icon}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold tracking-tight">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 break-words">
                    {toast.message}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
