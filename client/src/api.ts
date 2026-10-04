import type { 
  User, 
  Product, 
  Unit, 
  LedgerItem, 
  ScanRecord,
  DisplayScanItem,
  Purchase,
  CustomerSummary,
  BasketProduct,
  ProductAnalysis, 
  AnalysisSummary, 
  LowStockAlertItem 
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000`;
let refreshPromise: Promise<boolean> | null = null;

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('quickkart_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function refreshSession(refreshToken: string): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (!refreshRes.ok) return false;

        const data = await refreshRes.json();
        if (!data.accessToken || !data.refreshToken) return false;
        localStorage.setItem('quickkart_access_token', data.accessToken);
        localStorage.setItem('quickkart_refresh_token', data.refreshToken);
        return true;
      } catch (error) {
        console.error('Unable to refresh QuickKart session:', error);
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const accessToken = localStorage.getItem('quickkart_access_token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  });

  if (res.status === 401 && !endpoint.startsWith('/display/') && !endpoint.startsWith('/auth/')) {
    if (accessToken && localStorage.getItem('quickkart_access_token') !== accessToken) {
      return request<T>(endpoint, options);
    }
    const refreshToken = localStorage.getItem('quickkart_refresh_token');
    if (refreshToken && endpoint !== '/auth/refresh' && endpoint !== '/auth/login') {
      if (await refreshSession(refreshToken)) return request<T>(endpoint, options);
    }

    localStorage.removeItem('quickkart_access_token');
    localStorage.removeItem('quickkart_refresh_token');
    localStorage.removeItem('quickkart_user');
    window.dispatchEvent(new Event('quickkart:auth-change'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || errorBody.message || `Request failed with status ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth (Admin & Staff)
  async login(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const data = await request<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem('quickkart_access_token', data.accessToken);
    localStorage.setItem('quickkart_refresh_token', data.refreshToken);
    localStorage.setItem('quickkart_user', JSON.stringify(data.user));
    window.dispatchEvent(new Event('quickkart:auth-change'));
    return data;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('quickkart_refresh_token');
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      });
    } finally {
      localStorage.removeItem('quickkart_access_token');
      localStorage.removeItem('quickkart_refresh_token');
      localStorage.removeItem('quickkart_user');
      window.dispatchEvent(new Event('quickkart:auth-change'));
    }
  },

  // Products (Admin & Staff)
  async getProducts(search: string = ''): Promise<Product[]> {
    const data = await request<{ products: Product[] }>(`/products?search=${encodeURIComponent(search)}`);
    return data.products;
  },

  async getProduct(id: string): Promise<Product> {
    const data = await request<{ product: Product }>(`/products/${id}`);
    return data.product;
  },

  async createProduct(product: Partial<Product>): Promise<Product> {
    const data = await request<{ product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
    return data.product;
  },

  async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
    const data = await request<{ product: Product }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
    return data.product;
  },

  async deleteProducts(ids: string[]): Promise<{ count: number }> {
    return request<{ success: boolean; count: number }>('/products', {
      method: 'DELETE',
      body: JSON.stringify({ ids })
    });
  },

  // Stock-in Scanning (Staff Only)
  async stockInUnit(productId: string, barcode: string, clientEventId?: string): Promise<Unit> {
    const data = await request<{ unit: Unit }>('/stock-in', {
      method: 'POST',
      body: JSON.stringify({ productId, barcode, clientEventId })
    });
    return data.unit;
  },

  // Live Display Scan Feed (Staff Only)
  async getScanFeed(): Promise<DisplayScanItem[]> {
    const data = await request<{ scans: DisplayScanItem[] }>('/scan-feed');
    return data.scans;
  },

  // Data Tab Boxes (Admin & Staff)
  async getUnits(productId: string, status?: 'instock' | 'sold'): Promise<{ units: Unit[]; count: number }> {
    let url = `/units?productId=${encodeURIComponent(productId)}`;
    if (status) url += `&status=${status}`;
    return request<{ units: Unit[]; count: number }>(url);
  },

  // Sell Tab Ledger
  async getLedger(search: string = ''): Promise<LedgerItem[]> {
    const data = await request<{ records: LedgerItem[] }>(`/ledger?search=${encodeURIComponent(search)}`);
    return data.records;
  },

  async checkoutSale(barcode: string): Promise<{ record: ScanRecord; current_stock: number }> {
    return request<{ record: ScanRecord; current_stock: number }>('/checkout', {
      method: 'POST',
      body: JSON.stringify({ barcode })
    });
  },

  // Notifications
  async getNotifications(): Promise<{ lowStock: { count: number; items: LowStockAlertItem[] }; recentPurchases: { count: number } }> {
    return request<{ lowStock: { count: number; items: LowStockAlertItem[] }; recentPurchases: { count: number } }>('/notifications');
  },

  // Customers Tab (Admin Only)
  async getCustomers(search: string = ''): Promise<Purchase[]> {
    const data = await request<{ purchases: Purchase[] }>(`/customers?search=${encodeURIComponent(search)}`);
    return data.purchases;
  },

  async getCustomerDetail(purchaseId: string): Promise<Purchase> {
    const data = await request<{ purchase: Purchase }>(`/customers/${purchaseId}`);
    return data.purchase;
  },

  async getCustomerByPhone(phone: string): Promise<CustomerSummary> {
    return request<CustomerSummary>(`/customers/by-phone/${encodeURIComponent(phone)}`);
  },

  // Analysis & AI
  async getAnalysisProducts(days: number = 30): Promise<ProductAnalysis[]> {
    const data = await request<{ products: ProductAnalysis[] }>(`/analysis/products?days=${days}`);
    return data.products;
  },

  async getAnalysisSummary(days: number = 30): Promise<AnalysisSummary> {
    const data = await request<{ summary: AnalysisSummary }>(`/analysis/summary?days=${days}`);
    return data.summary;
  },

  async runAIAnalysis(days: number = 30): Promise<{ source: string; summary: string; products: any[]; created_at: string }> {
    const data = await request<{ report: { source: string; summary: string; products: any[]; created_at: string } }>(
      `/analysis/ai?days=${days}`,
      { method: 'POST' }
    );
    return data.report;
  },

  // ================= DIGITAL DISPLAY API ================= //

  async createDisplayBasket(displayId?: string): Promise<{ basketId: string; displayId: string; status: string }> {
    return request<{ basketId: string; displayId: string; status: string }>('/display/baskets', {
      method: 'POST',
      body: JSON.stringify({ displayId })
    });
  },

  async scanDisplayBarcode(barcode: string, basketId: string): Promise<{ result: string; message?: string; product?: BasketProduct }> {
    return request<{ result: string; message?: string; product?: BasketProduct }>('/display/scan', {
      method: 'POST',
      body: JSON.stringify({ barcode, basketId })
    });
  },

  async removeDisplayItem(basketId: string, barcode: string): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/display/baskets/${basketId}/items/${encodeURIComponent(barcode)}`, {
      method: 'DELETE'
    });
  },

  async cancelDisplayBasket(basketId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/display/baskets/${basketId}/cancel`, {
      method: 'POST'
    });
  },

  async setDisplayCustomerPhone(basketId: string, phone: string): Promise<{ success: boolean; phone: string }> {
    return request<{ success: boolean; phone: string }>(`/display/baskets/${basketId}/phone`, {
      method: 'POST',
      body: JSON.stringify({ phone })
    });
  },

  async payDisplayOnline(basketId: string, paymentMethod: 'card' | 'upi'): Promise<{ success: boolean; purchase: Purchase; gatewayRef: string; message: string }> {
    return request<{ success: boolean; purchase: Purchase; gatewayRef: string; message: string }>(`/display/baskets/${basketId}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paymentMethod })
    });
  },

  async approveDisplayCash(basketId: string, staffCode: string, password: string): Promise<{ success: boolean; purchase: Purchase; approvedBy: string; message: string }> {
    return request<{ success: boolean; purchase: Purchase; approvedBy: string; message: string }>(`/display/baskets/${basketId}/cash-approval`, {
      method: 'POST',
      body: JSON.stringify({ staffCode, password })
    });
  },

  async getDisplayBasket(basketId: string): Promise<{ basket: any; items: any[]; total: number }> {
    return request<{ basket: any; items: any[]; total: number }>(`/display/baskets/${basketId}`);
  }
};
