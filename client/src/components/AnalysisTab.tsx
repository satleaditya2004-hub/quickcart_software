import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  AlertTriangle, 
  AlertOctagon, 
  Clock, 
  Brain, 
  Search, 
  Zap
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import type { ProductAnalysis, AnalysisSummary } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export const AnalysisTab: React.FC = () => {
  const { addToast } = useToast();
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [products, setProducts] = useState<ProductAnalysis[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // AI analysis state
  const [aiReport, setAiReport] = useState<{ summary: string; products: any[]; created_at?: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Selected alert filter modal or inline filter
  const [activeAlertFilter, setActiveAlertFilter] = useState<string | null>(null);

  const fetchAnalysisData = useCallback(async () => {
    try {
      setLoading(true);
      const [prodsData, sumData] = await Promise.all([
        api.getAnalysisProducts(periodDays),
        api.getAnalysisSummary(periodDays)
      ]);
      setProducts(prodsData);
      setSummary(sumData);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Analysis Error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [addToast, periodDays]);

  useEffect(() => {
    void fetchAnalysisData();
  }, [fetchAnalysisData]);

  // Run Claude AI Deep Analysis (FR-18, Section 6.6)
  const handleRunAIAnalysis = async () => {
    try {
      setAiLoading(true);
      const report = await api.runAIAnalysis(periodDays);
      setAiReport(report);

      // Merge AI verdicts into products
      setProducts(prev => prev.map(p => {
        const aiMatch = report.products?.find((item: any) => item.id === p.id);
        if (aiMatch) {
          return {
            ...p,
            ai_verdict: aiMatch.verdict,
            ai_insight: aiMatch.insight,
            ai_action: aiMatch.action
          };
        }
        return p;
      }));

      addToast({
        type: 'success',
        title: 'Claude AI Analysis Completed',
        message: 'Product-by-product verdicts and shop recommendations updated.'
      });
    } catch {
      addToast({
        type: 'error',
        title: 'AI Analysis Failed',
        message: 'Reverting to built-in rule engine metrics.'
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Color palette for charts
  const TEAL_PRIMARY = '#0F766E';
  const AMBER_ACCENT = '#F59E0B';
  const PIE_COLORS = ['#0F766E', '#14B8A6', '#F59E0B', '#6366F1', '#EC4899', '#64748B'];

  // Status chip styling
  const getStatusBadge = (status: ProductAnalysis['status']) => {
    switch (status) {
      case 'Low stock':
        return 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/60';
      case 'Expired unsold':
        return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-900/60';
      case 'Near expiry':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
      case 'Slow mover':
        return 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900/60';
      case 'Healthy':
      default:
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60';
    }
  };

  const getVerdictBadge = (verdict?: string) => {
    switch (verdict) {
      case 'Star':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-extrabold';
      case 'Steady':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 font-semibold';
      case 'Watch':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 font-semibold';
      case 'Risk':
        return 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 font-bold';
      case 'Dead stock':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300 font-bold';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Filtered products list
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (activeAlertFilter === 'low_stock') return p.stock < 5;
    if (activeAlertFilter === 'expiring_soon') return p.expiring_soon > 0;
    if (activeAlertFilter === 'expired_unsold') return p.expired_unsold > 0;
    if (activeAlertFilter === 'reorder_soon') return p.days_to_stock_out !== null && p.days_to_stock_out <= 3;

    if (statusFilter === 'all') return true;
    return p.status.toLowerCase() === statusFilter.toLowerCase();
  });

  return (
    <div className="space-y-6">
      
      {/* Controls Bar: Period Selector & Run Claude AI Button (FR-17, FR-18) */}
      <div className="bg-white dark:bg-[#132220] rounded-2xl border border-gray-200/80 dark:border-teal-900/40 p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Inventory & AI Intelligence
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Automated health scores, stock-out forecasts, and product-by-product AI recommendations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector (7 / 30 / 90 days) */}
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-teal-900/70 p-1 bg-gray-50 dark:bg-gray-900/60">
            {[7, 30, 90].map(days => (
              <button
                key={days}
                onClick={() => setPeriodDays(days)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  periodDays === days
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>

          {/* Run Claude AI Deep Analysis Button */}
          <button
            onClick={handleRunAIAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-700 via-teal-800 to-amber-600 hover:opacity-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-900/20 disabled:opacity-50 transition-all"
          >
            {aiLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Running Retail AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Run Claude AI analysis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Whole-Shop AI Summary Card (Section 4.4 S7 & 6.6) */}
      {(aiReport || summary) && (
        <div className="bg-gradient-to-br from-teal-900 via-teal-950 to-gray-900 text-white rounded-2xl p-5 sm:p-6 shadow-lg border border-teal-700/50 relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-amber-400" />
                <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-teal-300">
                  {aiReport ? 'Claude AI Store Intelligence Brief' : 'Rule Engine Analytical Overview'}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-teal-400/80 bg-teal-950/60 border border-teal-800/80 px-2 py-0.5 rounded-full">
                {aiReport?.created_at ? 'Updated Live' : 'Active Period'}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-teal-50/95 leading-relaxed">
              {aiReport?.summary || 
                `QuickKart rule engine monitored ₹${summary?.total_revenue.toLocaleString('en-IN')} in total sales across ${summary?.total_units_sold} units over the last ${periodDays} days. A 7-day forecast anticipates ~${summary?.seven_day_forecast_units} units in sales. Attention is advised on ${summary?.alerts.low_stock.count} products approaching stock depletion.`}
            </p>
          </div>
        </div>
      )}

      {/* 4 Alert Cards (Section 4.4 S7: low stock, expiring, expired, reorder soon) */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Alert 1: Low Stock (< 5) */}
          <div
            onClick={() => setActiveAlertFilter(activeAlertFilter === 'low_stock' ? null : 'low_stock')}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeAlertFilter === 'low_stock'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-500 shadow-md ring-2 ring-red-400'
                : 'bg-white dark:bg-[#132220] border-gray-200/80 dark:border-teal-900/40 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                Low Stock
              </span>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary.alerts.low_stock.count}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Items under 5 units left on shelf
            </p>
          </div>

          {/* Alert 2: Expiring Soon (7 days) */}
          <div
            onClick={() => setActiveAlertFilter(activeAlertFilter === 'expiring_soon' ? null : 'expiring_soon')}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeAlertFilter === 'expiring_soon'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 shadow-md ring-2 ring-amber-400'
                : 'bg-white dark:bg-[#132220] border-gray-200/80 dark:border-teal-900/40 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Expiring Soon
              </span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary.alerts.expiring_soon.count}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Units expiring within next 7 days
            </p>
          </div>

          {/* Alert 3: Expired Unsold */}
          <div
            onClick={() => setActiveAlertFilter(activeAlertFilter === 'expired_unsold' ? null : 'expired_unsold')}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeAlertFilter === 'expired_unsold'
                ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 shadow-md ring-2 ring-purple-400'
                : 'bg-white dark:bg-[#132220] border-gray-200/80 dark:border-teal-900/40 hover:border-purple-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                Expired Unsold
              </span>
              <AlertOctagon className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary.alerts.expired_unsold.count}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Passed expiry date still in stock
            </p>
          </div>

          {/* Alert 4: Reorder Soon */}
          <div
            onClick={() => setActiveAlertFilter(activeAlertFilter === 'reorder_soon' ? null : 'reorder_soon')}
            className={`cursor-pointer p-4 rounded-xl border transition-all ${
              activeAlertFilter === 'reorder_soon'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 shadow-md ring-2 ring-blue-400'
                : 'bg-white dark:bg-[#132220] border-gray-200/80 dark:border-teal-900/40 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Reorder Soon
              </span>
              <Zap className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">
              {summary.alerts.reorder_soon.count}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Stock-out predicted in &le; 3 days
            </p>
          </div>

        </div>
      )}

      {/* 4 Summary Metric Tiles (Units sold, Revenue, Avg days to sell, Avg discount) */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
              Units Sold ({periodDays}d)
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {summary.total_units_sold}
            </div>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold mt-1 block">
              7-Day Forecast: ~{summary.seven_day_forecast_units} units
            </span>
          </div>

          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
              Gross Revenue
            </span>
            <div className="text-2xl font-black text-teal-700 dark:text-teal-300 mt-1">
              ₹{summary.total_revenue.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 block">
              Avg per sale: ₹{summary.total_units_sold > 0 ? Math.round(summary.total_revenue / summary.total_units_sold) : 0}
            </span>
          </div>

          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
              Avg Days to Sell
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {summary.avg_days_to_sell} days
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 block">
              Time from stock-in scan to sale
            </span>
          </div>

          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
              Average Discount
            </span>
            <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {summary.avg_discount_pct}%
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 block">
              (MRP − SP) / MRP across units
            </span>
          </div>
        </div>
      )}

      {/* 3 Recharts Visualizations (Units Bar, Daily Trend + Forecast Line, Revenue Donut) */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart 1: Units Sold by Product (Slow movers in Amber #F59E0B) */}
          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Units Sold by Product
              </h4>
              <span className="text-[10px] text-amber-500 font-semibold">
                Amber = Slow Mover
              </span>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.charts.units_by_product}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#132220', borderColor: '#0F766E', color: '#fff', fontSize: '11px', borderRadius: '8px' }}
                  />
                  <Bar dataKey="units_sold" name="Units Sold">
                    {summary.charts.units_by_product.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.is_slow_mover ? AMBER_ACCENT : TEAL_PRIMARY} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Daily Sales & 7-Day Forecast */}
          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Sales Trend & 7-Day Forecast
              </h4>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                Dashed = Projections
              </span>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={summary.charts.daily_sales_trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#132220', borderColor: '#0F766E', color: '#fff', fontSize: '11px', borderRadius: '8px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="units" 
                    name="Daily Units" 
                    stroke={TEAL_PRIMARY} 
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Revenue Contribution Donut */}
          <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Revenue Share
              </h4>
              <span className="text-[10px] text-gray-400 font-mono">Top SKUs</span>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.charts.revenue_share}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="revenue"
                    nameKey="name"
                  >
                    {summary.charts.revenue_share.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => `₹${Number(val).toFixed(2)}`}
                    contentStyle={{ backgroundColor: '#132220', borderColor: '#0F766E', color: '#fff', fontSize: '11px', borderRadius: '8px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* ---------------- "EVERY PRODUCT, ANALYSED" RANKED TABLE (FR-17, Section 6) ---------------- */}
      <div className="bg-white dark:bg-[#132220] rounded-xl border border-gray-200/80 dark:border-teal-900/40 shadow-sm overflow-hidden">
        
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-gray-100 dark:border-teal-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">
              Every Product, Analysed ({filteredProducts.length} products)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sorted by Health Score (worst first) so inventory vulnerabilities appear immediately at the top.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status chip filter */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs">
              {['all', 'Low stock', 'Expired unsold', 'Near expiry', 'Slow mover', 'Healthy'].map(st => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st);
                    setActiveAlertFilter(null);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap ${
                    statusFilter === st && !activeAlertFilter
                      ? 'bg-teal-700 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Product search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter table..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Table Component */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-teal-950/40 border-b border-gray-200 dark:border-teal-900/50 text-gray-600 dark:text-gray-300 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4 text-center">Stock</th>
                <th className="py-3 px-4 text-center">Sold ({periodDays}d)</th>
                <th className="py-3 px-4">Revenue</th>
                <th className="py-3 px-4 text-center">Stock-Out in</th>
                <th className="py-3 px-4 text-center">Trend</th>
                <th className="py-3 px-4 text-center">Health Score</th>
                <th className="py-3 px-4">Status Chip</th>
                <th className="py-3 px-4 min-w-[240px]">Recommendation / AI Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-teal-900/30">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    Computing product analysis...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    No products match the filter.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors"
                    >
                      {/* Product Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {p.name}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          {p.weight || 'Single'} · ₹{p.selling_price} (MRP ₹{p.mrp})
                        </div>
                      </td>

                      {/* Stock Count */}
                      <td className="py-3 px-4 text-center">
                        <span className={`font-bold ${p.stock < 5 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                          {p.stock}
                        </span>
                      </td>

                      {/* Units Sold in Period */}
                      <td className="py-3 px-4 text-center font-semibold text-gray-900 dark:text-gray-200">
                        {p.units_sold}
                      </td>

                      {/* Revenue */}
                      <td className="py-3 px-4 font-bold text-teal-700 dark:text-teal-300">
                        ₹{p.revenue.toFixed(2)}
                      </td>

                      {/* Stock-Out in (days) */}
                      <td className="py-3 px-4 text-center">
                        {p.days_to_stock_out !== null ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            p.days_to_stock_out <= 3
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                              : p.days_to_stock_out <= 7
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            ~{p.days_to_stock_out}d
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      {/* Trend (Rising, Falling, Steady) */}
                      <td className="py-3 px-4 text-center">
                        {p.trend === 'rising' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold" title="Sales velocity rising">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Up</span>
                          </span>
                        ) : p.trend === 'falling' ? (
                          <span className="inline-flex items-center gap-1 text-red-500 font-semibold" title="Sales velocity falling">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>Down</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 font-medium">
                            <Minus className="w-3.5 h-3.5" />
                            <span>Steady</span>
                          </span>
                        )}
                      </td>

                      {/* Health Score (0 - 100) */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`font-black text-xs ${
                            p.health_score < 50 
                              ? 'text-red-600 dark:text-red-400' 
                              : p.health_score < 75 
                                ? 'text-amber-600 dark:text-amber-400' 
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {p.health_score} / 100
                          </span>
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                p.health_score < 50 ? 'bg-red-500' : p.health_score < 75 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${p.health_score}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status Chip Priority */}
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(p.status)}`}>
                          {p.status}
                        </span>
                      </td>

                      {/* Recommendation / AI Verdict & Action */}
                      <td className="py-3 px-4">
                        {p.ai_verdict ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${getVerdictBadge(p.ai_verdict)}`}>
                                {p.ai_verdict}
                              </span>
                              <span className="text-[11px] font-bold text-teal-800 dark:text-teal-200">
                                {p.ai_action}
                              </span>
                            </div>
                            {p.ai_insight && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                "{p.ai_insight}"
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            {p.recommendation}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
