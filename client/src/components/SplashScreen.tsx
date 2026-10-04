import React, { useEffect, useState } from 'react';
import { ShoppingCart, Sparkles, ArrowRight } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 1500; // 1.5 seconds per PRD FR-1
    const interval = 30;
    const step = 100 / (duration / interval);

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 100);
          return 100;
        }
        return Math.min(prev + step, 100);
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-950 text-white flex flex-col items-center justify-center p-6 select-none">
      {/* Background ambient glow */}
      <div className="absolute w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
        {/* Animated Cart Icon with Badge */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-2xl bg-teal-600/40 backdrop-blur-md border border-teal-400/30 flex items-center justify-center shadow-2xl shadow-teal-950/50">
            <ShoppingCart className="w-12 h-12 text-teal-200 stroke-[2.2]" />
          </div>
          <div className="absolute -top-2 -right-2 bg-amber-500 text-teal-950 p-1.5 rounded-full shadow-lg">
            <Sparkles className="w-4 h-4 fill-current" />
          </div>
        </div>

        {/* Brand Title */}
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
          Quick<span className="text-teal-300">Kart</span>
        </h1>

        {/* Tagline per Section 4.4 */}
        <p className="text-teal-100/90 text-sm font-medium tracking-wide mb-8">
          Smart stock. Faster sales.
        </p>

        {/* Progress Bar */}
        <div className="w-48 h-1.5 bg-teal-950/60 rounded-full overflow-hidden p-0.5 border border-teal-700/50 mb-6">
          <div
            className="h-full bg-gradient-to-r from-teal-400 to-amber-400 rounded-full transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Quick Skip button */}
        <button
          onClick={onComplete}
          className="text-xs text-teal-300/80 hover:text-white flex items-center gap-1.5 transition-colors py-1 px-3 rounded-full hover:bg-teal-800/40"
        >
          Skip to Login <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Footer Info */}
      <div className="absolute bottom-6 text-center text-xs text-teal-400/60">
        Retail Inventory & Sales Tracker v1.0
      </div>
    </div>
  );
};
