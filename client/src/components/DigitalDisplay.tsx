import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ShoppingCart, 
  Sparkles, 
  ArrowRight, 
  CreditCard, 
  Smartphone, 
  Banknote, 
  CheckCircle2, 
  Camera, 
  Barcode, 
  AlertCircle, 
  RotateCcw, 
  X, 
  Phone,
  Check,
  ShieldCheck,
  Plus,
  Minus
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import type { BasketProduct, Product } from '../types';
import { api } from '../api';
import { sound } from '../socket';
import { ProductImage } from './ProductImage';

interface DigitalDisplayProps {
  onExitDisplay?: () => void;
}

type DisplayScreen = 
  | 'welcome' 
  | 'ready' 
  | 'shopping' 
  | 'mobile' 
  | 'payment_choice' 
  | 'payment_online' 
  | 'cash_approval' 
  | 'payment_done' 
  | 'thank_you';

export const DigitalDisplay: React.FC<DigitalDisplayProps> = ({ onExitDisplay }) => {
  const [currentScreen, setCurrentScreen] = useState<DisplayScreen>('welcome');
  const [basketId, setBasketId] = useState<string>('');
  const [basketItems, setBasketItems] = useState<BasketProduct[]>([]);
  const [displayProducts, setDisplayProducts] = useState<Pick<Product, 'id' | 'name' | 'weight' | 'barcode' | 'photo_url' | 'mrp' | 'selling_price' | 'stock_count'>[]>([]);
  const [loadingDisplayProducts, setLoadingDisplayProducts] = useState(false);
  const [latestProduct, setLatestProduct] = useState<BasketProduct | null>(null);

  // Scan feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Customer phone for WhatsApp receipt
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'upi' | 'cash'>('upi');

  // Cash approval modal state
  const [staffCode, setStaffCode] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Online payment processing state
  const [payingLoading, setPayingLoading] = useState(false);
  const [billNumber, setBillNumber] = useState<number | null>(null);

  // Hardware Scanner / Camera scanner
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const keyBurstRef = useRef<{ buffer: string; lastKeyTime: number }>({ buffer: '', lastKeyTime: 0 });

  // 1. Auto-transition from Welcome to Ready after ~3.5 seconds (DF-1, DF-2)
  useEffect(() => {
    let timer: any;
    if (currentScreen === 'welcome') {
      timer = setTimeout(() => {
        setCurrentScreen('ready');
      }, 3500);
    }
    return () => clearTimeout(timer);
  }, [currentScreen]);

  // 2. Start shopping session (DF-3)
  const handleStartShopping = async () => {
    try {
      setLoadingDisplayProducts(true);
      const products = await api.getDisplayProducts();
      const res = await api.createDisplayBasket();
      setBasketId(res.basketId);
      setBasketItems([]);
      setDisplayProducts(products);
      setLatestProduct(null);
      setPhoneInput('');
      setStaffCode('');
      setStaffPassword('');
      setFeedback(null);
      setCurrentScreen('shopping');
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to start shopping. Please try again.'
      });
    } finally {
      setLoadingDisplayProducts(false);
    }
  };

  // 3. Scan barcode on digital display (DF-4, DF-5, DF-7, DF-8)
  const handleDisplayScan = useCallback(async (barcode: string, manual = false) => {
    const code = barcode.trim();
    if (!code || !basketId) return;

    const now = Date.now();
    if (!manual && now - lastScanTimeRef.current < 1000) {
      return; // 1 second debounce
    }
    if (!manual) lastScanTimeRef.current = now;

    try {
      const res = await api.scanDisplayBarcode(code, basketId);

      if (res.result === 'not_registered') {
        sound.playError();
        setFeedback({
          type: 'error',
          message: 'Product not found, please ask staff'
        });
        return;
      }

      if (res.result === 'out_of_stock') {
        sound.playError();
        setFeedback({
          type: 'warning',
          message: 'This product is currently out of stock'
        });
        return;
      }

      if (res.result === 'added' && res.product) {
        sound.playScanSuccess();
        const p = res.product;
        setLatestProduct(p);
        setDisplayProducts(prev => prev.map(product =>
          product.barcode === p.barcode
            ? { ...product, stock_count: Math.max(0, product.stock_count - 1) }
            : product
        ));

        setBasketItems(prev => {
          const existingIndex = prev.findIndex(item => item.barcode === p.barcode);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex].quantity = p.quantity;
            return updated;
          } else {
            return [...prev, p];
          }
        });

        setFeedback({
          type: 'success',
          message: `Added: ${p.name}`
        });

        setManualBarcode('');
      }
    } catch (err: any) {
      sound.playError();
      setFeedback({
        type: 'error',
        message: err.message || 'Product not found, please ask staff'
      });
    } finally {
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    }
  }, [basketId]);

  const handleRemoveDisplayItem = async (item: BasketProduct) => {
    try {
      await api.removeDisplayItem(basketId, item.barcode);
      setDisplayProducts(prev => prev.map(product =>
        product.barcode === item.barcode
          ? { ...product, stock_count: product.stock_count + 1 }
          : product
      ));
      setBasketItems(prev => prev
        .map(current => current.barcode === item.barcode
          ? { ...current, quantity: current.quantity - 1 }
          : current)
        .filter(current => current.quantity > 0));
    } catch (error) {
      sound.playError();
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to remove this item. Please try again.'
      });
    }
  };

  // Keyboard wedge listener for physical scanner gun on kiosk
  useEffect(() => {
    if (currentScreen !== 'shopping') return;

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
          handleDisplayScan(keyBurstRef.current.buffer);
          keyBurstRef.current.buffer = '';
        }
      } else if (e.key.length === 1) {
        keyBurstRef.current.buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScreen, basketId, handleDisplayScan]);

  // Camera toggle for customer scan
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
          const qr = new Html5Qrcode('kiosk-camera-scanner-view');
          html5QrCodeRef.current = qr;
          await qr.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 1.777778 },
            (decodedText) => {
              handleDisplayScan(decodedText);
            },
            () => {}
          );
        } catch {
          setFeedback({ type: 'error', message: 'Unable to access the camera. Check browser permissions.' });
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

  // End Shopping: cancels basket, releases items, returns to Welcome (DF-10)
  const handleEndShopping = async () => {
    if (basketId) {
      try {
        await api.cancelDisplayBasket(basketId);
      } catch (error) {
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to cancel this basket. Please try again.'
        });
        return;
      }
    }
    setBasketItems([]);
    setLatestProduct(null);
    setBasketId('');
    setCurrentScreen('welcome');
  };

  // Pay Now clicked: Go to mobile number input (DF-11)
  const handleGoToPayment = () => {
    if (basketItems.length === 0) {
      setFeedback({ type: 'warning', message: 'Please scan at least one product first.' });
      return;
    }
    setCurrentScreen('mobile');
  };

  // Submit mobile number
  const handlePhoneSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (phoneInput.trim().length < 8) {
      setFeedback({ type: 'error', message: 'Please enter a valid mobile number for WhatsApp receipt.' });
      return;
    }

    try {
      await api.setDisplayCustomerPhone(basketId, phoneInput);
      setCurrentScreen('payment_choice');
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    }
  };

  // Complete Online Payment (Card / UPI)
  const handleCompleteOnlinePayment = async () => {
    try {
      setPayingLoading(true);
      const res = await api.payDisplayOnline(basketId, selectedPaymentMethod as 'card' | 'upi');
      sound.playSaleSuccess();
      setBillNumber(res.purchase.bill_no);
      setCurrentScreen('payment_done');

      setTimeout(() => {
        setCurrentScreen('thank_you');
        setTimeout(() => {
          setCurrentScreen('welcome');
          setBasketItems([]);
          setLatestProduct(null);
        }, 3500);
      }, 2500);
    } catch (err: any) {
      sound.playError();
      setFeedback({ type: 'error', message: err.message || 'Payment processing failed.' });
    } finally {
      setPayingLoading(false);
    }
  };

  // Complete Cash Payment via Staff Approval (DF-13)
  const handleStaffCashApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffCode || !staffPassword) {
      setApprovalError('Please enter Staff ID and Password.');
      return;
    }

    try {
      setApprovalLoading(true);
      setApprovalError(null);
      const res = await api.approveDisplayCash(basketId, staffCode, staffPassword);
      sound.playSaleSuccess();
      setBillNumber(res.purchase.bill_no);
      setCurrentScreen('payment_done');

      setTimeout(() => {
        setCurrentScreen('thank_you');
        setTimeout(() => {
          setCurrentScreen('welcome');
          setBasketItems([]);
          setLatestProduct(null);
          setStaffCode('');
          setStaffPassword('');
        }, 3500);
      }, 2500);
    } catch (err: any) {
      sound.playError();
      setApprovalError(err.message || 'Invalid Staff ID or Password.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const totalAmount = basketItems.reduce((acc, item) => acc + item.selling_price * item.quantity, 0);

  // Keypad append helper for touch screens
  const appendPhoneKey = (char: string) => {
    if (phoneInput.length < 15) {
      setPhoneInput(prev => prev + char);
    }
  };

  const backspacePhone = () => {
    setPhoneInput(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F3F7F7] select-none flex flex-col font-sans overflow-hidden">
      
      {/* Kiosk Floating Header Banner */}
      <div className="bg-teal-900 text-white px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-700 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-teal-200" />
          </div>
          <div>
            <span className="font-black tracking-tight text-lg text-white">Quick<span className="text-amber-400">Kart</span></span>
            <span className="text-xs text-teal-300 ml-2 font-medium">Digital Display Terminal</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-teal-300/80 bg-teal-950 px-2.5 py-1 rounded-full border border-teal-800">
            Kiosk 1 · Active
          </span>
          {onExitDisplay && (
            <button
              onClick={onExitDisplay}
              className="text-xs text-teal-300 hover:text-white px-3 py-1 rounded-lg border border-teal-700/60 hover:bg-teal-800 transition-colors"
            >
              Exit to Mall Software
            </button>
          )}
        </div>
      </div>

      {/* ================= SCREEN 1: WELCOME SCREEN (DF-1) ================= */}
      {currentScreen === 'welcome' && (
        <div className="flex-1 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-950 text-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500 relative">
          <div className="w-32 h-32 rounded-3xl bg-teal-700/50 border border-teal-400/40 flex items-center justify-center shadow-2xl mb-8 animate-bounce">
            <ShoppingCart className="w-16 h-16 text-teal-200" />
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-4">
            Welcome to Shopping Mall
          </h1>
          <p className="text-lg sm:text-xl text-teal-200 font-medium max-w-md mb-8">
            Smart self-checkout with QuickKart digital display.
          </p>

          <button
            onClick={() => setCurrentScreen('ready')}
            className="text-sm text-teal-300/80 hover:text-white flex items-center gap-1.5 underline decoration-teal-400 cursor-pointer"
          >
            Touch anywhere to begin
          </button>
        </div>
      )}

      {/* ================= SCREEN 2: "ARE YOU READY FOR SHOPPING?" (DF-2) ================= */}
      {currentScreen === 'ready' && (
        <div className="flex-1 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-950 text-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-300">
          <div className="max-w-xl w-full p-8 rounded-3xl bg-teal-950/60 border border-teal-700/60 shadow-2xl backdrop-blur-md flex flex-col items-center">
            
            <div className="w-20 h-20 rounded-2xl bg-amber-500 text-teal-950 flex items-center justify-center mb-6 shadow-xl">
              <Sparkles className="w-10 h-10 fill-current" />
            </div>

            <h2 className="text-3xl sm:text-5xl font-black mb-4">
              Are you ready for shopping?
            </h2>

            <p className="text-teal-200 text-sm sm:text-base mb-8 max-w-md">
              Scan your items on this display, review your basket in real time, and pay with Card, UPI, or Cash.
            </p>

            {feedback && (
              <p role="alert" className="mb-4 text-sm font-semibold text-red-200">
                {feedback.message}
              </p>
            )}

            <button
              onClick={handleStartShopping}
            disabled={loadingDisplayProducts}
            className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:opacity-95 text-teal-950 font-black text-xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3 transition-all transform active:scale-95"
            >
              <span>{loadingDisplayProducts ? 'Loading products...' : 'Yes, Start Shopping'}</span>
              {!loadingDisplayProducts && <ArrowRight className="w-6 h-6 stroke-[3]" />}
            </button>

          </div>
        </div>
      )}

      {/* ================= SCREEN 3: SHOPPING SCREEN WITH ROTATING PRODUCT (DF-3 to DF-9) ================= */}
      {currentScreen === 'shopping' && (
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden">
          
          {/* Top Feedback Banner */}
          {feedback && (
            <div className={`mb-3 p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-bold shadow-md animate-in slide-in-from-top-2 duration-200 ${
              feedback.type === 'error'
                ? 'bg-red-500 text-white border-red-600'
                : feedback.type === 'warning'
                  ? 'bg-amber-500 text-teal-950 border-amber-600'
                  : 'bg-emerald-600 text-white border-emerald-700'
            }`}>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{feedback.message}</span>
              </div>
              <button onClick={() => setFeedback(null)} className="p-1 hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Main 2-Column Shopping Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
            
            {/* Left Column (5 cols): QuickKart Logo + 360-Degree Rotating Photo (DF-3, DF-4) */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-200 shadow-lg p-6 flex flex-col items-center justify-between relative overflow-hidden">
              
              {/* QuickKart Logo at Top Left per DF-3 */}
              <div className="w-full flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-800 text-white flex items-center justify-center shadow-md">
                    <ShoppingCart className="w-7 h-7 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-teal-900 tracking-tight">
                      Quick<span className="text-amber-500">Kart</span>
                    </h2>
                    <p className="text-xs text-teal-700 font-semibold">Live Scanner Active</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isCameraActive ? 'bg-red-100 text-red-700 border-red-300' : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span className="hidden sm:inline">{isCameraActive ? 'Close' : 'Camera'}</span>
                  </button>
                </div>
              </div>

              {/* Camera Scanner Viewfinder */}
              {isCameraActive && (
                <div className="w-full my-2 rounded-2xl overflow-hidden border-2 border-teal-600 bg-black p-2">
                  <div id="kiosk-camera-scanner-view" className="w-full max-w-xs mx-auto" />
                  <p className="text-center text-xs text-white/80 py-1">Align barcode to scan</p>
                </div>
              )}

              {/* 360-DEGREE ROTATING PRODUCT PHOTO ON PEDESTAL (DF-4) */}
              <div className="flex-1 flex flex-col items-center justify-center py-6 w-full">
                {latestProduct ? (
                  <div className="flex flex-col items-center animate-in zoom-in-75 duration-300">
                    
                    {/* The 3D Rotating Product Image */}
                    <div className="relative group mb-6">
                      {/* Pedestal Shadow */}
                      <div className="w-56 h-12 bg-teal-950/20 rounded-full blur-xl absolute -bottom-4 left-1/2 -translate-x-1/2 pointer-events-none" />
                      
                      {/* Rotating Pedestal Frame */}
                      <div className="w-64 h-64 rounded-full p-2 bg-gradient-to-b from-teal-50 to-teal-100 border border-teal-200 shadow-xl flex items-center justify-center relative">
                        <ProductImage
                          src={latestProduct.photo_url}
                          alt={latestProduct.name}
                          className="w-52 h-52 object-contain rounded-2xl drop-shadow-2xl transition-transform duration-1000 animate-[spin_12s_linear_infinite]"
                        />
                      </div>
                    </div>

                    {/* Product Details Tag */}
                    <div className="text-center max-w-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                        {latestProduct.weight || 'Standard unit'}
                      </span>
                      <h3 className="text-xl font-black text-gray-900 mt-2 truncate">
                        {latestProduct.name}
                      </h3>
                      <div className="flex items-center justify-center gap-3 mt-1">
                        <span className="text-sm text-gray-400 line-through">MRP ₹{latestProduct.mrp}</span>
                        <span className="text-2xl font-black text-teal-800">₹{latestProduct.selling_price}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5">Exp: {latestProduct.expiry_date}</p>
                    </div>

                  </div>
                ) : (
                  <div className="text-center p-8">
                    <div className="w-32 h-32 rounded-full border-4 border-dashed border-teal-200 flex items-center justify-center mx-auto mb-4 text-teal-300">
                      <Barcode className="w-16 h-16 animate-pulse" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800">Scan Any Product</h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-xs">
                      Hold the product barcode up to the scanner to view its 360° photo and add it to your basket.
                    </p>
                  </div>
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (manualBarcode.trim()) void handleDisplayScan(manualBarcode, true);
                }}
                className="w-full flex gap-2 pt-3"
              >
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(event) => setManualBarcode(event.target.value)}
                  placeholder="Enter product barcode manually"
                  aria-label="Product barcode"
                  className="min-w-0 flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <button
                  type="submit"
                  disabled={!manualBarcode.trim()}
                  className="px-3 py-2 text-xs font-bold rounded-lg bg-teal-700 text-white disabled:opacity-40"
                >
                  Add item
                </button>
              </form>

              <div className="w-full pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase text-gray-500">Tap a product to add</span>
                  <span className="text-[10px] text-gray-400">{displayProducts.length} products</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {displayProducts.map(product => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={product.stock_count === 0}
                      onClick={() => void handleDisplayScan(product.barcode, true)}
                      className="min-w-0 flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 text-left transition-colors hover:border-teal-500 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ProductImage
                        src={product.photo_url}
                        alt={product.name}
                        className="h-12 w-12 shrink-0 rounded-lg border border-gray-100 object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-gray-900">{product.name}</span>
                        <span className="block text-sm font-black text-teal-800">₹{product.selling_price}</span>
                        <span className="block text-[10px] text-gray-400">
                          {product.stock_count > 0 ? `${product.stock_count} in stock` : 'Out of stock'}
                        </span>
                      </span>
                      {product.stock_count > 0 && <Plus className="h-4 w-4 shrink-0 text-teal-700" />}
                    </button>
                  ))}
                  {displayProducts.length === 0 && (
                    <p className="col-span-2 py-4 text-center text-xs text-gray-400">No products are available.</p>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column (7 cols): Basket Items List & Total (DF-5, DF-6) */}
            <div className="lg:col-span-7 bg-white rounded-3xl border border-gray-200 shadow-lg p-6 flex flex-col justify-between overflow-hidden">
              
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4 shrink-0">
                <h3 className="text-lg font-black text-gray-900 tracking-tight">
                  Your Shopping Basket ({basketItems.reduce((acc, i) => acc + i.quantity, 0)} items)
                </h3>
                <span className="font-mono text-xs font-bold text-gray-500">
                  Kiosk Session
                </span>
              </div>

              {/* Basket Items Scrollable List (Photo, Name, Price, Expiry, Quantity per DF-5) */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 pr-1">
                {basketItems.length === 0 ? (
                  <div className="py-20 text-center text-gray-400">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-base font-bold text-gray-500">Your basket is empty</p>
                    <p className="text-xs text-gray-400 mt-1">Scan a product to begin adding items</p>
                  </div>
                ) : (
                  basketItems.map((item) => (
                    <div key={item.barcode} className="py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
                      
                      {/* Photo Thumbnail + Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductImage
                          src={item.photo_url}
                          alt={item.name}
                          className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.weight || 'Standard'}</p>
                          <p className="text-[11px] text-teal-700 font-medium">Exp: {item.expiry_date}</p>
                        </div>
                      </div>

                      {/* Quantity Stepper & Price */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => void handleRemoveDisplayItem(item)}
                            className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-black text-sm px-1.5">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleDisplayScan(item.barcode, true)}
                            className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center font-bold text-gray-700 hover:bg-gray-100"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-right w-20">
                          <span className="font-black text-gray-900 text-base">
                            ₹{(item.selling_price * item.quantity).toFixed(2)}
                          </span>
                          <span className="block text-[10px] text-gray-400">
                            (₹{item.selling_price} each)
                          </span>
                        </div>
                      </div>

                    </div>
                  ))
                )}
              </div>

              {/* Running Total & Bottom Action Bar (DF-6, DF-9) */}
              <div className="pt-4 border-t border-gray-100 mt-4 shrink-0 space-y-4">
                <div className="flex items-center justify-between px-2">
                  <span className="text-sm font-bold text-gray-600 uppercase">Running Total</span>
                  <span className="text-3xl font-black text-teal-900">
                    ₹{totalAmount.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* End Shopping Button (DF-10) */}
                  <button
                    onClick={handleEndShopping}
                    className="py-4 px-6 rounded-2xl border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>End Shopping</span>
                  </button>

                  {/* Pay Now Button (DF-9, DF-11) */}
                  <button
                    onClick={handleGoToPayment}
                    disabled={basketItems.length === 0}
                    className="py-4 px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-black text-base shadow-xl shadow-teal-700/25 flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <span>Pay Now</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ================= SCREEN 4: ENTER MOBILE NUMBER (DF-11) ================= */}
      {currentScreen === 'mobile' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F3F7F7]">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-200 p-8 text-center animate-in zoom-in-95 duration-200">
            
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
              Enter Your Mobile Number
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 mb-6">
              Your itemized receipt will be sent directly to your <span className="font-bold text-emerald-600">WhatsApp</span>.
            </p>

            {/* Phone Display Input */}
            <div className="p-4 rounded-2xl bg-gray-50 border-2 border-teal-600 text-2xl font-black font-mono tracking-widest text-teal-950 mb-6 flex items-center justify-center min-h-[64px]">
              {phoneInput || <span className="text-gray-300 font-normal">e.g. 9876543210</span>}
            </div>

            {/* Large Touchscreen Number Pad */}
            <div className="grid grid-cols-3 gap-2.5 mb-6 max-w-xs mx-auto">
              {['1','2','3','4','5','6','7','8','9','+91','0','⌫'].map(btn => (
                <button
                  key={btn}
                  type="button"
                  onClick={() => {
                    if (btn === '⌫') backspacePhone();
                    else if (btn === '+91') setPhoneInput('+91 ');
                    else appendPhoneKey(btn);
                  }}
                  className="h-14 rounded-2xl bg-gray-100 hover:bg-teal-50 active:bg-teal-200 text-xl font-bold text-gray-800 transition-colors flex items-center justify-center shadow-sm"
                >
                  {btn}
                </button>
              ))}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentScreen('shopping')}
                className="w-1/3 py-3 rounded-xl border border-gray-300 text-gray-700 font-bold text-xs"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handlePhoneSubmit()}
                disabled={phoneInput.trim().length < 8}
                className="flex-1 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold text-sm shadow-md"
              >
                Continue to Payment
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= SCREEN 5: PAYMENT METHOD SELECTION (DF-12) ================= */}
      {currentScreen === 'payment_choice' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F3F7F7]">
          <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-gray-200 p-8 text-center animate-in zoom-in-95 duration-200">
            
            <h3 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Choose Payment Method
            </h3>
            <p className="text-sm text-gray-500 mt-1 mb-8">
              Amount Due: <span className="text-2xl font-black text-teal-800 ml-1">₹{totalAmount.toFixed(2)}</span>
            </p>

            {/* 3 Payment Method Cards (Card, UPI, Cash) per DF-12 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              
              {/* Card */}
              <div
                onClick={() => {
                  setSelectedPaymentMethod('card');
                  setCurrentScreen('payment_online');
                }}
                className="p-6 rounded-2xl border-2 border-gray-200 hover:border-teal-600 hover:bg-teal-50/40 cursor-pointer transition-all flex flex-col items-center justify-center text-center shadow-sm group active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center mb-4 group-hover:bg-teal-700 group-hover:text-white transition-colors">
                  <CreditCard className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-gray-900">Credit / Debit Card</h4>
                <p className="text-xs text-gray-400 mt-1">Tap, chip or swipe</p>
              </div>

              {/* UPI */}
              <div
                onClick={() => {
                  setSelectedPaymentMethod('upi');
                  setCurrentScreen('payment_online');
                }}
                className="p-6 rounded-2xl border-2 border-gray-200 hover:border-teal-600 hover:bg-teal-50/40 cursor-pointer transition-all flex flex-col items-center justify-center text-center shadow-sm group active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Smartphone className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-gray-900">UPI QR Code</h4>
                <p className="text-xs text-gray-400 mt-1">GPay, PhonePe, Paytm</p>
              </div>

              {/* Cash */}
              <div
                onClick={() => setCurrentScreen('cash_approval')}
                className="p-6 rounded-2xl border-2 border-gray-200 hover:border-amber-600 hover:bg-amber-50/40 cursor-pointer transition-all flex flex-col items-center justify-center text-center shadow-sm group active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mb-4 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Banknote className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-gray-900">Cash Payment</h4>
                <p className="text-xs text-gray-400 mt-1">Staff approval required</p>
              </div>

            </div>

            <button
              onClick={() => setCurrentScreen('mobile')}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline"
            >
              ← Back to phone entry
            </button>

          </div>
        </div>
      )}

      {/* ================= SCREEN 6A: ONLINE PAYMENT (CARD / UPI) (DF-14) ================= */}
      {currentScreen === 'payment_online' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F3F7F7]">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-200 p-8 text-center animate-in zoom-in-95 duration-200">
            
            <h3 className="text-2xl font-black text-gray-900">
              {selectedPaymentMethod === 'upi' ? 'Scan UPI QR Code' : 'Insert / Tap Card'}
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-6">
              Amount to pay: <span className="font-bold text-teal-800 text-lg">₹{totalAmount.toFixed(2)}</span>
            </p>

            {/* Simulated Gateway Display */}
            {selectedPaymentMethod === 'upi' ? (
              <div className="p-6 rounded-2xl bg-gray-50 border-2 border-dashed border-teal-500 inline-block mb-6">
                {/* Simulated QR Code SVG */}
                <div className="w-48 h-48 bg-white border border-gray-200 p-2 flex flex-col items-center justify-center shadow-inner">
                  <div className="w-40 h-40 bg-[radial-gradient(#000_2px,transparent_2px)] [background-size:8px_8px] flex items-center justify-center relative">
                    <div className="p-2 bg-white rounded-lg shadow-md">
                      <span className="font-black text-teal-800 text-xs">QuickKart UPI</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 font-mono">Scan with any UPI app</p>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-teal-50 border border-teal-200 mb-6 flex flex-col items-center">
                <CreditCard className="w-20 h-20 text-teal-700 animate-pulse mb-3" />
                <p className="text-sm font-bold text-teal-900">Ready for Card</p>
                <p className="text-xs text-teal-700">Please tap or insert card on the attached reader</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleCompleteOnlinePayment}
                disabled={payingLoading}
                className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                {payingLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Payment (Simulate Gateway)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setCurrentScreen('payment_choice')}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                Change payment method
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= SCREEN 6B: STAFF CASH APPROVAL SCREEN (DF-13, 3.5, 3.6) ================= */}
      {currentScreen === 'cash_approval' && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F3F7F7]">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-gray-200 p-8 text-center animate-in zoom-in-95 duration-200">
            
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-black text-gray-900">
              Staff Cash Approval
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 mb-6">
              Please call a mall staff member to accept cash of <span className="font-bold text-gray-900">₹{totalAmount.toFixed(2)}</span>.
            </p>

            {approvalError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
                {approvalError}
              </div>
            )}

            <form onSubmit={handleStaffCashApproval} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Mall Staff ID (e.g. STAFF01) *
                </label>
                <input
                  type="text"
                  required
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value.toUpperCase())}
                  placeholder="STAFF01"
                  className="w-full px-4 py-3 font-mono font-bold text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Staff Password *
                </label>
                <input
                  type="password"
                  required
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={approvalLoading}
                  className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-teal-950 font-black text-base shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {approvalLoading ? (
                    <div className="w-5 h-5 border-2 border-teal-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Approve & Accept Cash</span>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentScreen('payment_choice')}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Cancel and change payment method
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= SCREEN 7: PAYMENT DONE (DF-13, DF-14) ================= */}
      {currentScreen === 'payment_done' && (
        <div className="flex-1 bg-emerald-700 text-white flex flex-col items-center justify-center p-8 text-center animate-in zoom-in-95 duration-300">
          <div className="w-24 h-24 rounded-full bg-white text-emerald-700 flex items-center justify-center shadow-2xl mb-6 animate-bounce">
            <Check className="w-14 h-14 stroke-[3]" />
          </div>

          <h2 className="text-4xl sm:text-5xl font-black mb-3">
            Payment Done!
          </h2>
          <p className="text-emerald-100 text-lg sm:text-xl font-medium max-w-md">
            ₹{totalAmount.toFixed(2)} received successfully.
          </p>

          {billNumber && (
            <div className="mt-4 px-4 py-1.5 rounded-full bg-emerald-800/80 border border-emerald-500/50 font-mono text-sm font-bold">
              Receipt No: BILL-{billNumber}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Bill receipt dispatched to WhatsApp: {phoneInput}</span>
          </div>
        </div>
      )}

      {/* ================= SCREEN 8: THANK YOU FOR SHOPPING (DF-15) ================= */}
      {currentScreen === 'thank_you' && (
        <div className="flex-1 bg-gradient-to-br from-teal-900 via-teal-800 to-teal-950 text-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
          <div className="w-20 h-20 rounded-2xl bg-amber-400 text-teal-950 flex items-center justify-center shadow-xl mb-6">
            <Sparkles className="w-10 h-10 fill-current" />
          </div>

          <h2 className="text-4xl sm:text-6xl font-black mb-4">
            Thank you for shopping!
          </h2>
          <p className="text-teal-200 text-base sm:text-xl max-w-md">
            Have a wonderful day. Next customer terminal preparing...
          </p>
        </div>
      )}

    </div>
  );
};
