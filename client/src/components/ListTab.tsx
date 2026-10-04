import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Search, 
  Edit3, 
  Info, 
  CheckSquare, 
  Square, 
  AlertCircle, 
  X, 
  Check, 
  Package, 
  Clock, 
  RotateCcw,
  Barcode,
  Image as ImageIcon
} from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { socket } from '../socket';

interface ListTabProps {
  initialInfoProductId?: string | null;
  onClearInfoProductId?: () => void;
}

export const ListTab: React.FC<ListTabProps> = ({ initialInfoProductId, onClearInfoProductId }) => {
  const { addToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [infoProduct, setInfoProduct] = useState<Product | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Form State for Register / Edit (Includes Barcode & Photo)
  const [formName, setFormName] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [formMrp, setFormMrp] = useState('');
  const [formSp, setFormSp] = useState('');
  const [formMfg, setFormMfg] = useState('');
  const [formExp, setFormExp] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await api.getProducts(search);
      setProducts(data);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error loading products', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [search]);

  // Real-time synchronization
  useEffect(() => {
    const handleProductChange = () => fetchProducts();
    const handleUnitStocked = () => fetchProducts();
    const handlePurchase = () => fetchProducts();

    socket.on('product:changed', handleProductChange);
    socket.on('unit:stocked', handleUnitStocked);
    socket.on('purchase:completed', handlePurchase);
    socket.on('units:released', handleProductChange);

    return () => {
      socket.off('product:changed', handleProductChange);
      socket.off('unit:stocked', handleUnitStocked);
      socket.off('purchase:completed', handlePurchase);
      socket.off('units:released', handleProductChange);
    };
  }, []);

  useEffect(() => {
    if (initialInfoProductId) {
      const prod = products.find(p => p.id === initialInfoProductId);
      if (prod) {
        setInfoProduct(prod);
      } else {
        api.getProduct(initialInfoProductId).then(p => setInfoProduct(p)).catch(() => {});
      }
      if (onClearInfoProductId) onClearInfoProductId();
    }
  }, [initialInfoProductId, products]);

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map(p => p.id));
    }
  };

  const openRegisterModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormWeight('');
    // Generate a default unique retail barcode for quick convenience
    setFormBarcode('890' + Math.floor(1000000000 + Math.random() * 9000000000));
    setFormPhotoUrl('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80');
    setFormMrp('');
    setFormSp('');
    setFormMfg('');
    setFormExp('');
    setFormError(null);
    setIsRegisterOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormWeight(p.weight || '');
    setFormBarcode(p.barcode);
    setFormPhotoUrl(p.photo_url);
    setFormMrp(p.mrp.toString());
    setFormSp(p.selling_price.toString());
    setFormMfg(p.manufacture_date || '');
    setFormExp(p.expiry_date);
    setFormError(null);
    setIsRegisterOpen(true);
  };

  const handleClearForm = () => {
    setFormName('');
    setFormWeight('');
    setFormBarcode('');
    setFormPhotoUrl('');
    setFormMrp('');
    setFormSp('');
    setFormMfg('');
    setFormExp('');
    setFormError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim() || !formBarcode.trim() || !formPhotoUrl.trim() || !formMrp || !formSp || !formExp) {
      setFormError('Name, Barcode, Photo URL, MRP, Selling Price, and Expiry Date are required.');
      return;
    }

    const mrp = Number(formMrp);
    const sp = Number(formSp);

    if (isNaN(mrp) || isNaN(sp) || mrp < 0 || sp < 0) {
      setFormError('MRP and Selling Price must be positive valid amounts.');
      return;
    }

    if (sp > mrp) {
      setFormError('Selling Price cannot exceed MRP.');
      return;
    }

    if (formMfg && formExp < formMfg) {
      setFormError('Expiry Date cannot be earlier than Manufacture Date.');
      return;
    }

    try {
      setFormSubmitting(true);
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          name: formName.trim(),
          weight: formWeight.trim() || null,
          barcode: formBarcode.trim(),
          photo_url: formPhotoUrl.trim(),
          mrp,
          selling_price: sp,
          manufacture_date: formMfg || null,
          expiry_date: formExp
        });
        addToast({ type: 'success', title: 'Product updated', message: `${formName} updated. Synced across all screens.` });
      } else {
        await api.createProduct({
          name: formName.trim(),
          weight: formWeight.trim() || null,
          barcode: formBarcode.trim(),
          photo_url: formPhotoUrl.trim(),
          mrp,
          selling_price: sp,
          manufacture_date: formMfg || null,
          expiry_date: formExp
        });
        addToast({ type: 'success', title: 'Product registered', message: `${formName} is now ready for scanning on displays.` });
      }

      setIsRegisterOpen(false);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await api.deleteProducts(selectedIds);
      addToast({ 
        type: 'info', 
        title: 'Products deleted', 
        message: `${selectedIds.length} item(s) soft-deleted. Scan & purchase history is preserved.` 
      });
      setSelectedIds([]);
      setIsDeleteModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Delete failed', message: err.message });
    }
  };

  const totalPages = Math.ceil(products.length / itemsPerPage) || 1;
  const paginatedProducts = products.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      
      {/* Page Header & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Mall Products Catalog
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Registered products sync automatically across all digital display kiosks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete ({selectedIds.length})</span>
          </button>

          <button
            onClick={openRegisterModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-md shadow-teal-700/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Register Product</span>
          </button>
        </div>
      </div>

      {/* Search & Bulk Selection Bar */}
      <div className="bg-white dark:bg-[#132220] rounded-xl p-3.5 border border-gray-200/80 dark:border-teal-900/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search by product name, barcode, or weight..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-400 transition-colors py-1.5 px-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-teal-950/40"
          >
            {selectedIds.length === products.length && products.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-teal-600" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
            <span>Select All ({products.length})</span>
          </button>
        </div>
      </div>

      {/* Products Table with Photo & Barcode (C9, MF-4, MF-5) */}
      <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-teal-950/40 border-b border-gray-200 dark:border-teal-900/50 text-gray-600 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 w-10 text-center">
                  <span className="sr-only">Select</span>
                </th>
                <th className="py-3.5 px-4">Photo</th>
                <th className="py-3.5 px-4">Product Name</th>
                <th className="py-3.5 px-4">Barcode Number</th>
                <th className="py-3.5 px-4 text-center">Stock Count</th>
                <th className="py-3.5 px-4">MRP</th>
                <th className="py-3.5 px-4">Selling Price</th>
                <th className="py-3.5 px-4">Expiry Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-teal-900/30">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading products...
                  </td>
                </tr>
              ) : paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-500 dark:text-gray-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    No products found. Click <span className="font-semibold text-teal-600 dark:text-teal-400">Register Product</span> to add your first item.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p, idx) => {
                  const isSelected = selectedIds.includes(p.id);
                  const isLowStock = p.stock_count < 5;
                  const isModerateStock = p.stock_count >= 5 && p.stock_count < 10;
                  const discountPct = p.mrp > 0 ? Math.round(((p.mrp - p.selling_price) / p.mrp) * 100) : 0;

                  const today = new Date().toISOString().split('T')[0];
                  const in7Days = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
                  const isExpired = p.expiry_date < today;
                  const isExpiringSoon = !isExpired && p.expiry_date <= in7Days;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected 
                          ? 'bg-teal-50/60 dark:bg-teal-950/50' 
                          : idx % 2 === 1 
                            ? 'bg-gray-50/40 dark:bg-gray-900/20' 
                            : 'bg-white dark:bg-transparent'
                      } hover:bg-teal-50/40 dark:hover:bg-teal-950/30`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(p.id)}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Photo Thumbnail */}
                      <td className="py-3 px-4">
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 dark:border-teal-900/60 bg-gray-100 dark:bg-gray-800 shrink-0">
                          <img
                            src={p.photo_url}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback image on error
                              (e.target as any).src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=150&q=80';
                            }}
                          />
                        </div>
                      </td>

                      {/* Product Name & Weight */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {p.weight || 'Standard unit'}
                        </div>
                      </td>

                      {/* Barcode Number (Monospace) */}
                      <td className="py-3 px-4 font-mono text-xs font-bold text-gray-800 dark:text-gray-200">
                        {p.barcode}
                      </td>

                      {/* Stock Count */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isLowStock
                              ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60 animate-pulse'
                              : isModerateStock
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60'
                                : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-900/60'
                          }`}
                        >
                          {p.stock_count} in stock
                        </span>
                      </td>

                      {/* MRP */}
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400 line-through text-xs">
                        ₹{p.mrp.toFixed(2)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                          ₹{p.selling_price.toFixed(2)}
                          {discountPct > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                              {discountPct}% off
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={isExpired ? 'text-red-600 font-bold' : isExpiringSoon ? 'text-amber-600 font-semibold' : 'text-gray-600 dark:text-gray-300'}>
                            {p.expiry_date}
                          </span>
                          {isExpired && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                              EXPIRED
                            </span>
                          )}
                          {isExpiringSoon && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              EXPIRING
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                            title="Edit Product Details"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setInfoProduct(p)}
                            className="p-1.5 rounded-md text-gray-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                            title="View Product Information"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {products.length > itemsPerPage && (
          <div className="py-3 px-4 bg-gray-50/50 dark:bg-teal-950/20 border-t border-gray-100 dark:border-teal-900/30 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, products.length)} of {products.length} products
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

      {/* ---------------- REGISTER & EDIT POPUP (C9, MF-4, MF-6) ---------------- */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#132220] rounded-2xl shadow-2xl border border-gray-200 dark:border-teal-900/60 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            
            <div className="p-5 bg-gray-50 dark:bg-teal-950/40 border-b border-gray-100 dark:border-teal-900/50 flex items-center justify-between sticky top-0 bg-opacity-95 backdrop-blur z-10">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {editingProduct ? 'Edit Product' : 'Register Product with Barcode & Photo'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Product details sync to all customer digital displays.
                </p>
              </div>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Basmati Premium Royal Rice"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              {/* Barcode Number (Unique) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Barcode Number (Unique) *
                </label>
                <div className="relative">
                  <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    placeholder="e.g. 8901234500101"
                    className="w-full pl-9 pr-3.5 py-2 font-mono text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Product Photo URL & Instant Preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Product Photo URL *
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="url"
                      required
                      value={formPhotoUrl}
                      onChange={(e) => setFormPhotoUrl(e.target.value)}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full pl-9 pr-3.5 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                    />
                  </div>
                  {/* Photo Preview Thumbnail */}
                  <div className="w-12 h-9 rounded-lg border border-gray-200 dark:border-teal-900/60 overflow-hidden bg-gray-100 shrink-0">
                    {formPhotoUrl ? (
                      <img src={formPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">No img</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Weight */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                  Weight / Specification
                </label>
                <input
                  type="text"
                  value={formWeight}
                  onChange={(e) => setFormWeight(e.target.value)}
                  placeholder="e.g. 500 g, 1 kg, Pack of 4"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                />
              </div>

              {/* Price Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    MRP (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formMrp}
                    onChange={(e) => setFormMrp(e.target.value)}
                    placeholder="250.00"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Selling Price (SP ₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formSp}
                    onChange={(e) => setFormSp(e.target.value)}
                    placeholder="230.00"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Manufacture Date (M.D)
                  </label>
                  <input
                    type="date"
                    value={formMfg}
                    onChange={(e) => setFormMfg(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1">
                    Expiry Date (E.D) *
                  </label>
                  <input
                    type="date"
                    required
                    value={formExp}
                    onChange={(e) => setFormExp(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-100 dark:border-teal-900/40 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-md shadow-teal-700/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    {formSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Product</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ---------------- READ-ONLY INFO MODAL ---------------- */}
      {infoProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#132220] rounded-2xl shadow-2xl border border-gray-200 dark:border-teal-900/60 max-w-md w-full overflow-hidden">
            <div className="p-5 bg-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={infoProduct.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-teal-500/40" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">Product Information</span>
                  <h3 className="text-base font-bold">{infoProduct.name}</h3>
                </div>
              </div>
              <button
                onClick={() => setInfoProduct(null)}
                className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-teal-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-teal-900/40">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Barcode</span>
                  <p className="font-mono font-bold text-gray-900 dark:text-white mt-0.5">{infoProduct.barcode}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Current Stock</span>
                  <p className="font-bold text-teal-700 dark:text-teal-300 text-base mt-0.5">{infoProduct.stock_count} units</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-teal-900/40">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">MRP</span>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mt-0.5">₹{infoProduct.mrp.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Selling Price</span>
                  <p className="font-bold text-gray-900 dark:text-white mt-0.5">₹{infoProduct.selling_price.toFixed(2)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-100 dark:border-teal-900/40">
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Manufacture Date</span>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mt-0.5">{infoProduct.manufacture_date || 'Not specified'}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Expiry Date</span>
                  <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{infoProduct.expiry_date}</p>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span>Last Updated: {infoProduct.updated_at}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => setInfoProduct(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- DELETE CONFIRMATION MODAL ---------------- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#132220] rounded-2xl shadow-2xl border border-gray-200 dark:border-teal-900/60 max-w-md w-full p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
              Delete {selectedIds.length} item(s)?
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-6">
              This will remove selected products from active lists and digital displays. Past scan units and customer purchases are safely kept.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 transition-all"
              >
                Yes, Delete Item(s)
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
