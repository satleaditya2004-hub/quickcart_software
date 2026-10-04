import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Camera, 
  Barcode, 
  Check, 
  CreditCard, 
  ShoppingBag
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import type { LedgerItem, ScanRecord } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { sound } from '../socket';
import { socket } from '../socket';

export const SellTab: React.FC = () => {
  const { addToast } = useToast();
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSoldItem, setLastSoldItem] = useState<{ record: ScanRecord; currentStock: number } | null>(null);

  // Camera scanner
  const [isCameraActive, setIsCameraActive] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Burst wedge listener
  const keyBurstRef = useRef<{ buffer: string; lastKeyTime: number }>({ buffer: '', lastKeyTime: 0 });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const items = await api.getLedger(search);
      setLedger(items);
    } catch (e: any) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [search]);

  // Real-time synchronization over WebSocket (FR-15, FR-16)
  useEffect(() => {
    const handleSaleCompleted = () => fetchLedger();
    const handleScanCreated = () => fetchLedger();

    socket.on('sale:completed', handleSaleCompleted);
    socket.on('scan:created', handleScanCreated);

    return () => {
      socket.off('sale:completed', handleSaleCompleted);
      socket.off('scan:created', handleScanCreated);
    };
  }, []);

  // Universal Checkout Scan Handler (FR-16, 2.6)
  const handleCheckoutScan = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    try {
      const res = await api.checkoutSale(code);

      // Play joyful dual-tone cash register chime
      sound.playSaleSuccess();

      addToast({
        type: 'success',
        title: `Sold: ${res.record.product_name || 'Item'}`,
        message: `Barcode ${code} marked sold for ₹${res.record.selling_price_snapshot}. Stock remaining: ${res.current_stock}`
      });

      setLastSoldItem({
        record: res.record,
        currentStock: res.current_stock
      });

      setBarcodeInput('');
      fetchLedger();
    } catch (err: any) {
      sound.playError();
      addToast({
        type: 'error',
        title: 'Checkout Failed',
        message: err.message || 'Not in stock or already sold.'
      });
    } finally {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }
  };

  // Global Keyboard Wedge for Checkout Scanner
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
          handleCheckoutScan(keyBurstRef.current.buffer);
          keyBurstRef.current.buffer = '';
        }
      } else if (e.key.length === 1) {
        keyBurstRef.current.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Camera toggle
  const toggleCamera = async () => {
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
          const qr = new Html5Qrcode('sell-camera-scanner-view');
          html5QrCodeRef.current = qr;
          await qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777778 },
            (decodedText) => {
              handleCheckoutScan(decodedText);
            },
            () => {}
          );
        } catch (err) {
          addToast({ type: 'error', title: 'Camera Error', message: 'Unable to access camera.' });
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

  // Filter & paginate
  const totalPages = Math.ceil(ledger.length / itemsPerPage) || 1;
  const paginatedItems = ledger.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Checkout Terminal
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Scan sold units to fill selling timestamp using FEFO matching (oldest expiry sold first).
          </p>
        </div>

        {/* Listening Status Chip */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700 shadow-sm animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-ping" />
            Listening for checkout scanner
          </span>
        </div>
      </div>

      {/* Checkout Scanner Action Bar */}
      <div className="bg-white dark:bg-[#132220] rounded-2xl border border-gray-200/80 dark:border-teal-900/40 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Barcode input field */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCheckoutScan(barcodeInput);
            }}
            className="flex-1 flex items-center gap-2 max-w-xl"
          >
            <div className="relative flex-1">
              <Barcode className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode at checkout or enter manually..."
                className="w-full pl-11 pr-4 py-3 font-mono text-base rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white dark:focus:bg-gray-900 transition-all shadow-inner"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={!barcodeInput.trim()}
              className="px-5 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-700/20 transition-all disabled:opacity-40 flex items-center gap-1.5 shrink-0"
            >
              <CreditCard className="w-4 h-4" />
              <span>Checkout</span>
            </button>
          </form>

          {/* Camera Scan Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleCamera}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                isCameraActive
                  ? 'bg-red-50 text-red-600 border-red-300 dark:bg-red-950/40 dark:border-red-800'
                  : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{isCameraActive ? 'Close Camera' : 'Camera Checkout'}</span>
            </button>
          </div>

        </div>

        {/* Camera Viewfinder */}
        {isCameraActive && (
          <div className="mt-4 rounded-xl overflow-hidden border-2 border-teal-600 bg-black relative p-2 max-w-sm mx-auto">
            <div id="sell-camera-scanner-view" className="w-full" />
            <p className="text-center text-xs text-white/80 py-2">
              Scan barcode at checkout
            </p>
          </div>
        )}

        {/* Last Sold Item Banner */}
        {lastSoldItem && (
          <div className="mt-5 p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-3 text-xs sm:text-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
              <div>
                <p className="font-bold text-emerald-950 dark:text-emerald-100">
                  Sold: {lastSoldItem.record.product_name}
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 font-mono">
                  Barcode: {lastSoldItem.record.barcode} · Sold at ₹{lastSoldItem.record.selling_price_snapshot}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">
                Remaining Stock:
              </span>
              <span className="font-black text-emerald-950 dark:text-emerald-100 text-sm">
                {lastSoldItem.currentStock} units
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Ledger Table Filter & Header */}
      <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-teal-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-teal-600" />
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
              Unit-Level Inventory & Sales Ledger ({ledger.length} units)
            </h3>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by barcode or product..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
        </div>

        {/* Table (FR-15: 8 Columns) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-teal-950/40 border-b border-gray-200 dark:border-teal-900/50 text-gray-600 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Scan Date</th>
                <th className="py-3 px-4">Scan Time</th>
                <th className="py-3 px-4">MRP</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Selling Price</th>
                <th className="py-3 px-4">Selling Date</th>
                <th className="py-3 px-4">Selling Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-teal-900/30">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    Loading ledger...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    No matching barcode units found.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      item.is_sold
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20' // Subtle green tint for sold units per Section 4.4 S6
                        : 'hover:bg-gray-50/50 dark:hover:bg-teal-950/20'
                    }`}
                  >
                    {/* Barcode in monospace */}
                    <td className="py-2.5 px-4 font-mono font-bold text-gray-900 dark:text-white">
                      {item.barcode}
                    </td>

                    {/* Product Name */}
                    <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-gray-200">
                      {item.product_name}
                    </td>

                    {/* Scan Date */}
                    <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                      {item.scan_date}
                    </td>

                    {/* Scan Time */}
                    <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400 font-mono text-[11px]">
                      {item.scan_time}
                    </td>

                    {/* MRP */}
                    <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400">
                      ₹{item.mrp.toFixed(2)}
                    </td>

                    {/* Expiry Date */}
                    <td className="py-2.5 px-4 text-gray-700 dark:text-gray-300 font-medium">
                      {item.expiry_date}
                    </td>

                    {/* Selling Price */}
                    <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white">
                      ₹{item.selling_price.toFixed(2)}
                    </td>

                    {/* Selling Date (or "—" if unsold) */}
                    <td className="py-2.5 px-4">
                      {item.selling_date ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {item.selling_date}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 font-bold">—</span>
                      )}
                    </td>

                    {/* Selling Time (or "—" if unsold) */}
                    <td className="py-2.5 px-4 font-mono text-[11px]">
                      {item.selling_time ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {item.selling_time}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 font-bold">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {ledger.length > itemsPerPage && (
          <div className="py-3 px-4 bg-gray-50/50 dark:bg-teal-950/20 border-t border-gray-100 dark:border-teal-900/30 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, ledger.length)} of {ledger.length} units
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              <span className="px-2 py-1 font-semibold text-gray-700 dark:text-gray-300">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
