import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Square, 
  Search, 
  Camera, 
  Barcode, 
  Sparkles,
  Radio,
  Activity
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import type { Product, DisplayScanItem } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { sound } from '../socket';
import { socket } from '../socket';
import { ProductImage } from './ProductImage';

export const ScanTab: React.FC = () => {
  const { addToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [scanningLoading, setScanningLoading] = useState(false);

  // Live Digital Display Scan Feed (MF-9)
  const [displayScans, setDisplayScans] = useState<DisplayScanItem[]>([]);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastBarcodeRef = useRef<string>('');
  const keyBurstRef = useRef<{ buffer: string; lastKeyTime: number }>({ buffer: '', lastKeyTime: 0 });

  const loadData = useCallback(async () => {
    try {
      const prods = await api.getProducts(search);
      setProducts(prods);
      if (!selectedProduct && prods.length > 0) {
        setSelectedProduct(prods[0]);
      }
      const feed = await api.getScanFeed();
      setDisplayScans(feed);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Unable to load scan data',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  }, [addToast, search, selectedProduct]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time live feed from digital displays (C4, MF-9)
  useEffect(() => {
    const handleScanReceived = (scanItem: any) => {
      setDisplayScans(prev => [
        {
          id: Math.random().toString(),
          barcode: scanItem.barcode,
          display_name: scanItem.display_name || 'Display 1',
          product_name: scanItem.product_name,
          result: scanItem.result,
          scanned_at: scanItem.time
        },
        ...prev.slice(0, 99)
      ]);
    };

    socket.on('scan:received', handleScanReceived);
    return () => {
      socket.off('scan:received', handleScanReceived);
    };
  }, []);

  // Stock-in Barcode Scanned Handler
  const handleStockInScan = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    const now = Date.now();
    if (code === lastBarcodeRef.current && (now - lastScanTimeRef.current) < 1500) {
      return;
    }
    lastBarcodeRef.current = code;
    lastScanTimeRef.current = now;

    if (!selectedProduct) {
      sound.playError();
      addToast({ type: 'warning', title: 'No Product Selected', message: 'Please select a product first.' });
      return;
    }

    try {
      setScanningLoading(true);
      await api.stockInUnit(selectedProduct.id, code);
      
      sound.playScanSuccess();
      addToast({
        type: 'success',
        title: 'Stocked In Unit',
        message: `Unit barcode ${code} created with frozen snapshot for ${selectedProduct.name}`
      });

      setBarcodeInput('');

      try {
        const updated = await api.getProduct(selectedProduct.id);
        setSelectedProduct(updated);
        setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
      } catch (error) {
        addToast({
          type: 'warning',
          title: 'Stock saved; refresh failed',
          message: error instanceof Error ? error.message : 'Reload the product list to see the updated count.'
        });
      }
    } catch (error: unknown) {
      sound.playError();
      addToast({
        type: 'error',
        title: 'Stock-in Failed',
        message: error instanceof Error ? error.message : 'Please try scanning again.'
      });
    } finally {
      setScanningLoading(false);
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }
  }, [addToast, selectedProduct]);

  // Keyboard wedge listener for USB / Bluetooth scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && target !== barcodeInputRef.current && target.getAttribute('type') === 'text') {
        return;
      }

      const now = Date.now();
      const timeDiff = now - keyBurstRef.current.lastKeyTime;

      if (timeDiff > 100) {
        keyBurstRef.current.buffer = '';
      }
      keyBurstRef.current.lastKeyTime = now;

      if (e.key === 'Enter') {
        if (keyBurstRef.current.buffer.length >= 4) {
          e.preventDefault();
          handleStockInScan(keyBurstRef.current.buffer);
          keyBurstRef.current.buffer = '';
        }
      } else if (e.key.length === 1) {
        keyBurstRef.current.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStockInScan]);

  // Camera scanner toggle
  const toggleCameraScanner = async () => {
    if (isCameraActive) {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current = null;
      }
      setIsCameraActive(false);
    } else {
      setIsCameraActive(true);
      setTimeout(async () => {
        try {
          const qr = new Html5Qrcode('staff-camera-scanner-view');
          html5QrCodeRef.current = qr;
          await qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777778 },
            (decodedText) => {
              handleStockInScan(decodedText);
            },
            () => {}
          );
        } catch (error) {
          addToast({
            type: 'error',
            title: 'Camera unavailable',
            message: error instanceof Error ? error.message : 'Unable to access camera.'
          });
          setIsCameraActive(false);
        }
      }, 200);
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleSimulateScan = () => {
    if (!selectedProduct) return;
    handleStockInScan(selectedProduct.barcode);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Staff Scan Hub
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Stock physical units into inventory and monitor live barcode reads from digital display kiosks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            isScanningActive
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 animate-pulse'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isScanningActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {isScanningActive ? 'Stock-In Active' : 'Stock-In Idle'}
          </span>
        </div>
      </div>

      {/* Main Grid: Left Stock-In Mode, Right Live Display Feed (MF-9) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (6 cols): Staff Stock-in Controls */}
        <div className="lg:col-span-6 space-y-5">
          
          {/* Target Product Selection */}
          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              Select Product to Stock-In
            </h3>
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {products.map(p => {
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      if (barcodeInputRef.current) barcodeInputRef.current.focus();
                    }}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 shadow-sm ring-1 ring-teal-500'
                        : 'bg-white dark:bg-gray-900/30 border-gray-200/80 dark:border-teal-900/30 hover:border-teal-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ProductImage src={p.photo_url} alt={p.name} className="w-8 h-8 rounded object-cover border border-gray-200" />
                      <div className="truncate">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-teal-900 dark:text-teal-200' : 'text-gray-900 dark:text-white'}`}>
                          {p.name}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {p.barcode} · ₹{p.selling_price}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100/70 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 shrink-0 ml-2">
                      {p.stock_count} in stock
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Product Banner & Scan Trigger */}
          {selectedProduct && (
            <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ProductImage src={selectedProduct.photo_url} alt={selectedProduct.name} className="w-12 h-12 rounded-lg object-cover border border-teal-500/40" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      Target Product
                    </span>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
                      {selectedProduct.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {selectedProduct.barcode}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isScanningActive ? (
                    <button
                      onClick={() => setIsScanningActive(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Scan Start</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsScanningActive(false)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all animate-pulse"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Scan End</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Barcode scanner input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleStockInScan(barcodeInput);
                }}
                className="space-y-3 pt-2"
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Scan unit barcode or type code..."
                      className="w-full pl-9 pr-3 py-2 font-mono text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!barcodeInput.trim() || scanningLoading}
                    className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs transition-all disabled:opacity-50"
                  >
                    Stock In
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateScan}
                    className="px-2.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
                    title="Simulate random unit barcode scan"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Simulate</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>💡 Scanners fire automatically on keypress.</span>
                  <button
                    type="button"
                    onClick={toggleCameraScanner}
                    className="flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isCameraActive ? 'Close Camera' : 'Camera Scanner'}</span>
                  </button>
                </div>

                {isCameraActive && (
                  <div className="rounded-xl overflow-hidden border-2 border-teal-600 bg-black p-2 mt-2">
                    <div id="staff-camera-scanner-view" className="w-full max-w-sm mx-auto" />
                  </div>
                )}
              </form>
            </div>
          )}

        </div>

        {/* Right Column (6 cols): Live Digital Display Scan Feed (C4, MF-9) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm p-4 flex flex-col h-[580px]">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-teal-900/40 mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                Live Customer Display Scan Feed
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300">
              Live WebSocket Sync
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-teal-900/30 pr-1">
            {displayScans.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400">
                <Radio className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600 animate-pulse" />
                Listening for barcode reads from digital display kiosks...
                <p className="mt-1 text-[11px] text-gray-400">
                  When a customer scans any product on a display, it appears here immediately.
                </p>
              </div>
            ) : (
              displayScans.map((scan) => {
                let badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
                let label = 'Added to Basket';

                if (scan.result === 'not_registered') {
                  badgeClass = 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300';
                  label = 'Not Registered (Rejected)';
                } else if (scan.result === 'out_of_stock') {
                  badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
                  label = 'Out of Stock';
                }

                return (
                  <div key={scan.id} className="py-2.5 px-2 hover:bg-gray-50/50 dark:hover:bg-teal-950/20 rounded transition-colors text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gray-900 dark:text-white">
                          {scan.barcode}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {scan.scanned_at}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 truncate mt-0.5">
                        {scan.product_name || 'Unregistered SKU'} · <span className="text-teal-600 dark:text-teal-400">{scan.display_name}</span>
                      </p>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${badgeClass}`}>
                      {label}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-teal-900/40 text-[11px] text-gray-500 dark:text-gray-400 text-center">
            Every customer scan on digital displays logs into the mall database in real time.
          </div>
        </div>

      </div>

    </div>
  );
};
