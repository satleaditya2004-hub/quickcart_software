import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Calendar, 
  CreditCard, 
  Phone, 
  Barcode, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  X,
  FileText,
  UserCheck,
  ShoppingBag,
  TrendingUp,
  Receipt
} from 'lucide-react';
import type { Purchase, PurchaseItem, CustomerSummary } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { socket } from '../socket';

export const CustomersTab: React.FC = () => {
  const { addToast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [repeatCustomer, setRepeatCustomer] = useState<CustomerSummary | null>(null);
  const [repeatLoading, setRepeatLoading] = useState(false);

  // View mode: 'all' purchases list vs 'repeat' customers analytics
  const [viewMode, setViewMode] = useState<'all' | 'repeat'>('all');

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const data = await api.getCustomers(search);
      setPurchases(data);
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error loading customers', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, [search]);

  // Live WebSocket updates when a customer finishes payment on display (C10, MF-13)
  useEffect(() => {
    const handlePurchaseCompleted = () => {
      fetchPurchases();
      addToast({
        type: 'info',
        title: 'New Customer Purchase Recorded',
        message: 'A digital display checkout just completed.'
      });
    };

    socket.on('purchase:completed', handlePurchaseCompleted);
    return () => {
      socket.off('purchase:completed', handlePurchaseCompleted);
    };
  }, []);

  const openPurchaseDetail = async (p: Purchase) => {
    try {
      const detailed = await api.getCustomerDetail(p.id);
      setSelectedPurchase(detailed);
    } catch (e) {
      setSelectedPurchase(p);
    }
  };

  const openRepeatCustomerSummary = async (phone: string) => {
    try {
      setRepeatLoading(true);
      const summary = await api.getCustomerByPhone(phone);
      setRepeatCustomer(summary);
    } catch (e: any) {
      addToast({ type: 'error', title: 'Error', message: e.message });
    } finally {
      setRepeatLoading(false);
    }
  };

  // Group purchases by phone number for Repeat Customer View (MF-14)
  const phoneGroups: Record<string, { phone: string; count: number; totalSpend: number; lastVisit: string }> = {};
  for (const p of purchases) {
    if (!phoneGroups[p.customer_phone]) {
      phoneGroups[p.customer_phone] = {
        phone: p.customer_phone,
        count: 0,
        totalSpend: 0,
        lastVisit: p.paid_at
      };
    }
    phoneGroups[p.customer_phone].count += 1;
    phoneGroups[p.customer_phone].totalSpend += p.total;
  }
  const repeatCustomerList = Object.values(phoneGroups).sort((a, b) => b.totalSpend - a.totalSpend);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Customer Purchases & Receipts (Admin Only)
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Real-time ledger of paying customers, WhatsApp receipts, and physical unit barcode breakdowns.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="inline-flex rounded-lg border border-gray-300 dark:border-teal-900/70 p-1 bg-white dark:bg-[#132220]">
          <button
            onClick={() => setViewMode('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'all'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            All Purchases ({purchases.length})
          </button>
          <button
            onClick={() => setViewMode('repeat')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'repeat'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            Repeat Customers ({repeatCustomerList.length})
          </button>
        </div>
      </div>

      {/* Search Bar (Search by Phone Number OR Barcode Number per MF-14) */}
      <div className="bg-white dark:bg-[#132220] rounded-xl p-3.5 border border-gray-200/80 dark:border-teal-900/40 shadow-sm flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer phone number, bill no, or barcode..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
          />
        </div>
        <span className="text-[11px] text-gray-400 hidden sm:inline">
          Live sync with digital display checkouts
        </span>
      </div>

      {/* Main View: All Purchases Table */}
      {viewMode === 'all' ? (
        <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-teal-950/40 border-b border-gray-200 dark:border-teal-900/50 text-gray-600 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Bill No.</th>
                  <th className="py-3.5 px-4">Customer Phone</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Products Bought</th>
                  <th className="py-3.5 px-4">Payment Method</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4 text-center">Receipt Status</th>
                  <th className="py-3.5 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-teal-900/30">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      Loading customer records...
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400">
                      No purchases found. Complete a checkout on the Digital Display to see customer records here.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => {
                    let methodBadge = 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200';
                    if (p.payment_method === 'upi') {
                      methodBadge = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200';
                    } else if (p.payment_method === 'cash') {
                      methodBadge = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200';
                    }

                    return (
                      <tr 
                        key={p.id}
                        onClick={() => openPurchaseDetail(p)}
                        className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 cursor-pointer transition-colors"
                      >
                        {/* Bill No. */}
                        <td className="py-3 px-4 font-mono font-bold text-teal-800 dark:text-teal-300">
                          BILL-{p.bill_no}
                        </td>

                        {/* Customer Phone (visible only to admin) */}
                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span>{p.customer_phone}</span>
                          </div>
                        </td>

                        {/* Date & Time */}
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs">
                          {p.paid_at}
                        </td>

                        {/* Products Bought Summary */}
                        <td className="py-3 px-4">
                          <div className="max-w-xs truncate text-gray-800 dark:text-gray-200 font-medium">
                            {p.items && p.items.length > 0 ? (
                              p.items.map(i => i.product_name).join(', ')
                            ) : (
                              'Items attached'
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400">
                            {p.items?.length || 0} unit(s)
                          </span>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase ${methodBadge}`}>
                            {p.payment_method}
                            {p.approved_by_code && (
                              <span className="text-[9px] font-normal normal-case ml-1">
                                (Staff: {p.approved_by_code})
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Total Amount */}
                        <td className="py-3 px-4 font-black text-gray-900 dark:text-white text-sm">
                          ₹{p.total.toFixed(2)}
                        </td>

                        {/* WhatsApp Receipt Status */}
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3" />
                            WhatsApp Sent
                          </span>
                        </td>

                        {/* View Action */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPurchaseDetail(p);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-teal-600 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Repeat Customers Grouped View (MF-14) */
        <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-teal-900/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800 dark:text-gray-200">
              Repeat Customers Grouped Analytics
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Customers ranked by lifetime spend and visit frequency.
            </p>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-teal-900/30">
            {repeatCustomerList.map((cust) => (
              <div 
                key={cust.phone}
                onClick={() => openRepeatCustomerSummary(cust.phone)}
                className="p-4 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 cursor-pointer transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 flex items-center justify-center font-bold text-sm">
                    {cust.phone.slice(-4)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>{cust.phone}</span>
                      {cust.count > 1 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Repeat Shopper ({cust.count} Visits)
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Last visit: {cust.lastVisit}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">Lifetime Spend</span>
                  <span className="text-sm font-black text-teal-700 dark:text-teal-300">
                    ₹{cust.totalSpend.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- PURCHASE DETAIL MODAL (MF-13: Full barcode numbers) ---------------- */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#132220] rounded-2xl shadow-2xl border border-gray-200 dark:border-teal-900/60 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="p-5 bg-teal-800 text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-6 h-6 text-teal-200" />
                <div>
                  <h3 className="text-base font-bold">Purchase Details · BILL-{selectedPurchase.bill_no}</h3>
                  <p className="text-xs text-teal-200">{selectedPurchase.paid_at}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-teal-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs sm:text-sm">
              
              {/* Customer Phone & Display info */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-gray-50 dark:bg-teal-950/40 border border-gray-200/80 dark:border-teal-900/50">
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Customer Mobile</span>
                  <p className="font-bold text-gray-900 dark:text-white mt-0.5">{selectedPurchase.customer_phone}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Terminal Kiosk</span>
                  <p className="font-medium text-gray-800 dark:text-gray-200 mt-0.5">{selectedPurchase.display_name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Payment Method</span>
                  <p className="font-bold text-gray-900 dark:text-white uppercase mt-0.5">{selectedPurchase.payment_method}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">WhatsApp Receipt</span>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Dispatched to Phone</p>
                </div>
              </div>

              {/* Itemized Physical Barcodes List (MF-13: barcode numbers of every product bought) */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2.5">
                  Itemized Unit Barcodes ({selectedPurchase.items?.length || 0})
                </h4>

                <div className="divide-y divide-gray-100 dark:divide-teal-900/30 border border-gray-200 dark:border-teal-900/50 rounded-xl overflow-hidden">
                  {selectedPurchase.items && selectedPurchase.items.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 bg-white dark:bg-[#132220] flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">
                          {item.product_name}
                        </p>
                        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                          Unit Barcode: <span className="font-bold text-teal-700 dark:text-teal-300">{item.barcode}</span>
                        </p>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white shrink-0">
                        ₹{item.price_paid.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-900/60 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-teal-900 dark:text-teal-200 uppercase block">Total Amount Paid</span>
                  {selectedPurchase.gateway_ref && (
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono">Ref: {selectedPurchase.gateway_ref}</span>
                  )}
                  {selectedPurchase.approved_by_code && (
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">Cash Approved by: {selectedPurchase.approved_by_code}</span>
                  )}
                </div>
                <span className="text-xl font-black text-teal-900 dark:text-teal-100">
                  ₹{selectedPurchase.total.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedPurchase(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white"
                >
                  Close Receipt
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ---------------- REPEAT CUSTOMER MODAL ---------------- */}
      {repeatCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#132220] rounded-2xl shadow-2xl border border-gray-200 dark:border-teal-900/60 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-teal-900/40 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Repeat Customer Profile
                </h3>
                <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold">{repeatCustomer.phone}</p>
              </div>
              <button
                onClick={() => setRepeatCustomer(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gray-50 dark:bg-teal-950/40 text-center">
                <span className="text-[10px] uppercase font-semibold text-gray-500">Total Visits</span>
                <p className="text-xl font-black text-gray-900 dark:text-white mt-1">{repeatCustomer.totalVisits}</p>
              </div>
              <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-center">
                <span className="text-[10px] uppercase font-semibold text-teal-700">Lifetime Spend</span>
                <p className="text-xl font-black text-teal-800 dark:text-teal-200 mt-1">₹{repeatCustomer.lifetimeSpend.toFixed(2)}</p>
              </div>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              Purchase History
            </h4>
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-teal-900/30 text-xs">
              {repeatCustomer.purchases.map(p => (
                <div key={p.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-gray-900 dark:text-white">BILL-{p.bill_no}</span>
                    <span className="text-[10px] text-gray-500 block">{p.paid_at}</span>
                  </div>
                  <span className="font-bold text-teal-700 dark:text-teal-300">₹{p.total.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setRepeatCustomer(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
