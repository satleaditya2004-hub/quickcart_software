import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  Package, 
  CheckCircle, 
  Clock, 
  ChevronDown
} from 'lucide-react';
import type { Product, Unit } from '../types';
import { api } from '../api';
import { socket } from '../socket';
import { useToast } from '../context/ToastContext';

export const DataTab: React.FC = () => {
  const { addToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [inStockRecords, setInStockRecords] = useState<Unit[]>([]);
  const [soldRecords, setSoldRecords] = useState<Unit[]>([]);

  const [inStockSearch, setInStockSearch] = useState('');
  const [soldSearch, setSoldSearch] = useState('');

  const loadProducts = useCallback(async () => {
    try {
      const prods = await api.getProducts();
      setProducts(prods);
      setSelectedProductId(currentId => currentId || prods[0]?.id || '');
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Unable to load products',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  }, [addToast]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  // Box 1 contains available units; Box 2 contains units from completed purchases.
  const fetchBoxRecords = useCallback(async (prodId: string) => {
    if (!prodId) return;
    try {
      const [inStockData, soldData, prod] = await Promise.all([
        api.getUnits(prodId, 'instock'),
        api.getUnits(prodId, 'sold'),
        api.getProduct(prodId)
      ]);
      setInStockRecords(inStockData.units);
      setSoldRecords(soldData.units);
      setSelectedProduct(prod);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Unable to load barcode records',
        message: error instanceof Error ? error.message : 'Please try again.'
      });
    }
  }, [addToast]);

  useEffect(() => {
    if (selectedProductId) {
      void fetchBoxRecords(selectedProductId);
    }
  }, [fetchBoxRecords, selectedProductId]);

  // Keep both ledgers current as units are stocked, reserved, released, or sold.
  useEffect(() => {
    const refreshSelectedProduct = () => {
      if (selectedProductId) void fetchBoxRecords(selectedProductId);
      void loadProducts();
    };

    const handleUnitChanged = (unit: Pick<Unit, 'product_id'>) => {
      if (unit.product_id === selectedProductId) refreshSelectedProduct();
    };

    const handlePurchaseCompleted = (data: { items?: Array<Pick<Unit, 'product_id'>> }) => {
      if (data.items?.some(item => item.product_id === selectedProductId)) {
        refreshSelectedProduct();
      }
    };

    const handleUnitsReleased = () => refreshSelectedProduct();

    socket.on('unit:stocked', handleUnitChanged);
    socket.on('unit:sold', handleUnitChanged);
    socket.on('unit:reserved', handleUnitChanged);
    socket.on('purchase:completed', handlePurchaseCompleted);
    socket.on('units:released', handleUnitsReleased);

    return () => {
      socket.off('unit:stocked', handleUnitChanged);
      socket.off('unit:sold', handleUnitChanged);
      socket.off('unit:reserved', handleUnitChanged);
      socket.off('purchase:completed', handlePurchaseCompleted);
      socket.off('units:released', handleUnitsReleased);
    };
  }, [fetchBoxRecords, loadProducts, selectedProductId]);

  // Filtered Box 1 (In-Stock) records
  const filteredInStock = inStockRecords.filter(r => 
    r.barcode.toLowerCase().includes(inStockSearch.toLowerCase())
  );

  // Filtered Box 2 (Sold) records
  const filteredSold = soldRecords.filter(r => 
    r.barcode.toLowerCase().includes(soldSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Dual-Ledger Data
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Side-by-side verification: Box 1 shows barcodes in stock; Box 2 shows barcodes sold.
          </p>
        </div>

        {/* Product Picker */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              disabled={products.length === 0}
              className="appearance-none pl-3.5 pr-8 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-teal-900 bg-white dark:bg-[#132220] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer shadow-sm"
            >
              {products.length === 0 && <option value="">No products available</option>}
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stock_count} in stock)
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Selected Product Summary Banner */}
      {selectedProduct && (
        <div className="bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/50 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-teal-950 dark:text-teal-100">
                {selectedProduct.name}
              </h3>
              <p className="text-xs text-teal-700 dark:text-teal-300">
                {selectedProduct.weight || 'Standard unit'} · MRP: ₹{selectedProduct.mrp} · SP: ₹{selectedProduct.selling_price}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#132220] border border-teal-200 dark:border-teal-900/60 shadow-sm">
              <span className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400 block">Current Stock</span>
              <span className="font-bold text-teal-700 dark:text-teal-300 text-sm">
                {inStockRecords.length} units
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#132220] border border-teal-200 dark:border-teal-900/60 shadow-sm">
              <span className="text-[10px] uppercase font-semibold text-gray-500 dark:text-gray-400 block">Total Sold</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                {soldRecords.length} units
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TWO EQUAL BOXES SIDE BY SIDE (FR-13, Section 4.4 S5) ---------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* ================= BOX 1: IN STOCK · READY TO SELL ================= */}
        <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm flex flex-col h-[580px] overflow-hidden">
          
          {/* Box 1 Header */}
          <div className="p-4 bg-teal-50/50 dark:bg-teal-950/40 border-b border-gray-200/80 dark:border-teal-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                Box 1: In stock · ready to sell
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-teal-100 dark:bg-teal-900/80 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700">
              {filteredInStock.length} barcodes
            </span>
          </div>

          {/* Box 1 Search filter */}
          <div className="p-3 border-b border-gray-100 dark:border-teal-900/30">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={inStockSearch}
                onChange={(e) => setInStockSearch(e.target.value)}
                placeholder="Filter in-stock barcodes..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Box 1 Scrollable Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-teal-900/30">
            {filteredInStock.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400 dark:text-gray-500">
                <Package className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                No unsold barcodes for this product.
                <p className="mt-1 text-[11px] text-gray-400">
                  Switch to the Scan tab to stock in units.
                </p>
              </div>
            ) : (
              filteredInStock.map((record) => (
                <div 
                  key={record.id}
                  className="p-3.5 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-gray-900 dark:text-white text-xs tracking-wider">
                      {record.barcode}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        Stocked: {record.scanned_at}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      MRP ₹{record.mrp_snapshot}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-teal-700 dark:text-teal-300 text-xs">
                      Price ₹{record.price_snapshot}
                    </span>
                    <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Exp: {record.expiry_snapshot}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Box 1 Footer Info */}
          <div className="p-2.5 bg-gray-50 dark:bg-teal-950/20 border-t border-gray-100 dark:border-teal-900/30 text-[11px] text-gray-500 dark:text-gray-400 text-center font-medium">
            Box 1 count always equals active shelf stock.
          </div>
        </div>

        {/* ================= BOX 2: SOLD ================= */}
        <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm flex flex-col h-[580px] overflow-hidden">
          
          {/* Box 2 Header */}
          <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/40 border-b border-gray-200/80 dark:border-emerald-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                Box 2: Sold
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
              {filteredSold.length} barcodes
            </span>
          </div>

          {/* Box 2 Search filter */}
          <div className="p-3 border-b border-gray-100 dark:border-emerald-900/30">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={soldSearch}
                onChange={(e) => setSoldSearch(e.target.value)}
                placeholder="Filter sold barcodes..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* Box 2 Scrollable Content */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-emerald-900/30">
            {filteredSold.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400 dark:text-gray-500">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                Nothing sold yet.
                <p className="mt-1 text-[11px] text-gray-400">
                  Completed customer-display purchases appear here.
                </p>
              </div>
            ) : (
              filteredSold.map((record) => (
                <div 
                  key={record.id}
                  className="p-3.5 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-gray-900 dark:text-white text-xs tracking-wider">
                      {record.barcode}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        Sold: {record.sold_at || '—'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                      Stocked: {record.scanned_at}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                      Paid ₹{record.price_snapshot}
                    </span>
                    <span className="block text-[10px] text-emerald-600/80 font-medium mt-0.5">
                      MRP ₹{record.mrp_snapshot}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Box 2 Footer Info */}
          <div className="p-2.5 bg-gray-50 dark:bg-emerald-950/20 border-t border-gray-100 dark:border-emerald-900/30 text-[11px] text-gray-500 dark:text-gray-400 text-center font-medium">
            A paid purchase moves the matching barcode from Box 1 to Box 2.
          </div>
        </div>

      </div>

    </div>
  );
};
