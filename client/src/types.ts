export type Role = 'admin' | 'staff';

export interface User {
  id: string;
  staff_code?: string;
  email: string;
  role: Role;
}

export interface Product {
  id: string;
  name: string;
  weight: string | null;
  barcode: string;
  photo_url: string;
  mrp: number;
  selling_price: number;
  manufacture_date: string | null;
  expiry_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  stock_count: number;
}

export interface Unit {
  id: string;
  product_id: string;
  barcode: string;
  status: 'instock' | 'reserved' | 'sold';
  scanned_at: string;
  mrp_snapshot: number;
  expiry_snapshot: string;
  price_snapshot: number;
  sold_at: string | null;
  product_name?: string;
  photo_url?: string;
}

export interface LedgerItem {
  id: string;
  barcode: string;
  product_name: string;
  photo_url?: string;
  scan_date: string;
  scan_time: string;
  mrp: number;
  expiry_date: string;
  selling_price: number;
  selling_date: string | null;
  selling_time: string | null;
  is_sold: boolean;
}

export interface ScanRecord {
  id: string;
  barcode: string;
  product_name: string;
  selling_price_snapshot: number;
}

export interface DisplayScanItem {
  id: string;
  barcode: string;
  result: 'added' | 'not_registered' | 'out_of_stock';
  scanned_at: string;
  display_name: string;
  product_name?: string;
  photo_url?: string;
}

export interface PurchaseItem {
  id: string;
  barcode: string;
  product_name: string;
  price_paid: number;
  photo_url?: string;
}

export interface Purchase {
  id: string;
  bill_no: number;
  customer_phone: string;
  total: number;
  payment_method: 'card' | 'upi' | 'cash';
  gateway_ref?: string | null;
  approved_by_code?: string | null;
  receipt_status: 'pending' | 'sent' | 'failed';
  paid_at: string;
  display_name: string;
  items: PurchaseItem[];
}

export interface CustomerSummary {
  phone: string;
  totalVisits: number;
  lifetimeSpend: number;
  purchases: Purchase[];
}

export interface BasketProduct {
  id: string;
  name: string;
  weight: string | null;
  barcode: string;
  photo_url: string;
  mrp: number;
  selling_price: number;
  expiry_date: string;
  quantity: number;
}

export interface ProductAnalysis {
  id: string;
  name: string;
  weight: string | null;
  barcode: string;
  photo_url: string;
  mrp: number;
  selling_price: number;
  stock: number;
  units_sold: number;
  period_days: number;
  revenue: number;
  discount_pct: number;
  days_to_sell: number | null;
  daily_sales_rate: number;
  days_to_stock_out: number | null;
  trend: 'rising' | 'falling' | 'steady';
  expired_unsold: number;
  expiring_soon: number;
  slow_mover: boolean;
  suggested_reorder: number;
  health_score: number;
  status: 'Low stock' | 'Expired unsold' | 'Near expiry' | 'Slow mover' | 'Healthy';
  recommendation: string;
  ai_verdict?: 'Star' | 'Steady' | 'Watch' | 'Risk' | 'Dead stock';
  ai_insight?: string;
  ai_action?: string;
}

export interface AnalysisSummary {
  period_days: number;
  total_units_sold: number;
  total_revenue: number;
  avg_days_to_sell: number;
  avg_discount_pct: number;
  seven_day_forecast_units: number;
  alerts: {
    low_stock: { count: number; products: { id: string; name: string; stock: number }[] };
    expiring_soon: { count: number; products: { id: string; name: string; units: number }[] };
    expired_unsold: { count: number; products: { id: string; name: string; units: number }[] };
    reorder_soon: { count: number; products: { id: string; name: string; days_left: number }[] };
  };
  charts: {
    units_by_product: { name: string; units_sold: number; is_slow_mover: boolean }[];
    daily_sales_trend: { date: string; units: number; revenue: number; is_forecast?: boolean }[];
    revenue_share: { name: string; revenue: number }[];
  };
}

export interface LowStockAlertItem {
  id: string;
  name: string;
  weight: string | null;
  barcode: string;
  photo_url: string;
  selling_price: number;
  stock_count: number;
}
