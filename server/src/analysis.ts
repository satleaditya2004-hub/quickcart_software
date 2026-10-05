import { db } from './db.js';
import crypto from 'crypto';

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

export function computeProductAnalysis(days: number = 30): { products: ProductAnalysis[]; summary: AnalysisSummary } {
  const periodDays = Number(days) || 30;

  // 1. Get all active products
  const products = db.prepare(`
    SELECT * FROM products WHERE deleted_at IS NULL ORDER BY name ASC
  `).all() as any[];

  // 2. Fetch all unit records
  const allUnits = db.prepare(`
    SELECT 
      id, product_id, barcode, status, scanned_at, mrp_snapshot,
      expiry_snapshot, price_snapshot, sold_at
    FROM units
  `).all() as any[];

  const now = new Date();
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysFutureStr = sevenDaysFuture.toISOString().split('T')[0];

  // Group units by product
  const unitsGroupedByProduct: Record<string, any[]> = {};
  for (const u of allUnits) {
    if (!unitsGroupedByProduct[u.product_id]) unitsGroupedByProduct[u.product_id] = [];
    unitsGroupedByProduct[u.product_id].push(u);
  }

  const soldCounts: number[] = [];
  const rawProductMetrics: any[] = [];

  for (const p of products) {
    const pUnits = unitsGroupedByProduct[p.id] || [];
    const unsold = pUnits.filter(u => u.status === 'instock');
    const stock = unsold.length;

    const soldInPeriod = pUnits.filter(u => u.status === 'sold' && u.sold_at && new Date(u.sold_at) >= periodStart);
    const unitsSold = soldInPeriod.length;
    soldCounts.push(unitsSold);

    const revenue = soldInPeriod.reduce((acc, u) => acc + (u.price_snapshot || 0), 0);

    // Discount %
    let discountPct = 0;
    if (soldInPeriod.length > 0) {
      const totalDisc = soldInPeriod.reduce((acc, u) => {
        const mrp = u.mrp_snapshot || 1;
        const sp = u.price_snapshot || mrp;
        return acc + Math.max(0, ((mrp - sp) / mrp) * 100);
      }, 0);
      discountPct = Math.round((totalDisc / soldInPeriod.length) * 10) / 10;
    } else if (p.mrp > 0) {
      discountPct = Math.round(Math.max(0, ((p.mrp - p.selling_price) / p.mrp) * 100) * 10) / 10;
    }

    // Days to sell
    let daysToSell: number | null = null;
    if (soldInPeriod.length > 0) {
      const totalDays = soldInPeriod.reduce((acc, u) => {
        const diff = (new Date(u.sold_at).getTime() - new Date(u.scanned_at).getTime()) / (1000 * 3600 * 24);
        return acc + Math.max(0, diff);
      }, 0);
      daysToSell = Math.round((totalDays / soldInPeriod.length) * 10) / 10;
    }

    // Expired unsold & Expiring soon
    const expiredUnsold = unsold.filter(u => u.expiry_snapshot < todayStr).length;
    const expiringSoon = unsold.filter(u => u.expiry_snapshot >= todayStr && u.expiry_snapshot <= sevenDaysFutureStr).length;

    // Daily sales rate
    const soldLast7 = pUnits.filter(u => u.status === 'sold' && u.sold_at && new Date(u.sold_at) >= sevenDaysAgo).length;
    const soldLast14 = pUnits.filter(u => u.status === 'sold' && u.sold_at && new Date(u.sold_at) >= fourteenDaysAgo).length;
    const dailyRate = Math.round((0.6 * (soldLast7 / 7) + 0.4 * (soldLast14 / 14)) * 100) / 100;

    // Days to stock out
    const daysToStockOut = dailyRate > 0 ? Math.round((stock / dailyRate) * 10) / 10 : null;

    // Trend
    const soldDays8To14 = Math.max(0, soldLast14 - soldLast7);
    let trend: 'rising' | 'falling' | 'steady' = 'steady';
    if (soldDays8To14 === 0 && soldLast7 > 0) {
      trend = 'rising';
    } else if (soldLast7 === 0 && soldDays8To14 > 0) {
      trend = 'falling';
    } else if (soldDays8To14 > 0) {
      const change = (soldLast7 - soldDays8To14) / soldDays8To14;
      if (change > 0.15) trend = 'rising';
      else if (change < -0.15) trend = 'falling';
      else trend = 'steady';
    }

    const suggestedReorder = Math.max(0, Math.ceil(dailyRate * 14 - stock));

    rawProductMetrics.push({
      p,
      stock,
      unitsSold,
      revenue,
      discountPct,
      daysToSell,
      expiredUnsold,
      expiringSoon,
      dailyRate,
      daysToStockOut,
      trend,
      suggestedReorder
    });
  }

  // Compute 25th percentile for slow mover
  soldCounts.sort((a, b) => a - b);
  const p25Index = Math.floor(soldCounts.length * 0.25);
  const p25Threshold = soldCounts.length > 0 ? soldCounts[p25Index] : 0;

  // Build finalized ProductAnalysis array
  const analyzedProducts: ProductAnalysis[] = rawProductMetrics.map(item => {
    const { p, stock, unitsSold, revenue, discountPct, daysToSell, expiredUnsold, expiringSoon, dailyRate, daysToStockOut, trend, suggestedReorder } = item;

    const isSlowMover = unitsSold <= p25Threshold || unitsSold === 0;

    // Health Score calculation (0 to 100)
    let score = 100;
    if (stock < 5) score -= 30;
    score -= (expiredUnsold * 8);
    score -= (expiringSoon * 4);
    if (isSlowMover) score -= 20;
    if (trend === 'rising') score += 5;
    const healthScore = Math.max(0, Math.min(100, score));

    // Status Chip Priority: Low stock -> Expired unsold -> Near expiry -> Slow mover -> Healthy
    let status: ProductAnalysis['status'] = 'Healthy';
    if (stock < 5) status = 'Low stock';
    else if (expiredUnsold > 0) status = 'Expired unsold';
    else if (expiringSoon > 0) status = 'Near expiry';
    else if (isSlowMover) status = 'Slow mover';

    // Rule-based Recommendation
    let recommendation = 'Healthy stock; maintain standard cadence.';
    if (stock < 5 && dailyRate > 0) {
      recommendation = `Restock ~${suggestedReorder || 10} units; daily sales velocity is ${dailyRate.toFixed(1)}/day.`;
    } else if (stock < 5) {
      recommendation = `Low stock (${stock} units left); replenish minimum safety stock.`;
    } else if (expiredUnsold > 0) {
      recommendation = `Remove ${expiredUnsold} expired unit(s) immediately from shelves.`;
    } else if (expiringSoon > 0) {
      recommendation = `Apply quick discount to ${expiringSoon} unit(s) expiring within 7 days.`;
    } else if (unitsSold === 0) {
      recommendation = `Zero sales in period; consider bundle discount or aisle repositioning.`;
    } else if (trend === 'falling') {
      recommendation = `Hold off new bulk orders; sales velocity decelerating.`;
    } else if (trend === 'rising') {
      recommendation = `Keep buffer inventory; demand is surging up.`;
    }

    return {
      id: p.id,
      name: p.name,
      weight: p.weight,
      barcode: p.barcode,
      photo_url: p.photo_url,
      mrp: p.mrp,
      selling_price: p.selling_price,
      stock,
      units_sold: unitsSold,
      period_days: periodDays,
      revenue,
      discount_pct: discountPct,
      days_to_sell: daysToSell,
      daily_sales_rate: dailyRate,
      days_to_stock_out: daysToStockOut,
      trend,
      expired_unsold: expiredUnsold,
      expiring_soon: expiringSoon,
      slow_mover: isSlowMover,
      suggested_reorder: suggestedReorder,
      health_score: healthScore,
      status,
      recommendation
    };
  });

  analyzedProducts.sort((a, b) => a.health_score - b.health_score);

  // Compute summary
  const totalUnitsSold = analyzedProducts.reduce((sum, p) => sum + p.units_sold, 0);
  const totalRevenue = analyzedProducts.reduce((sum, p) => sum + p.revenue, 0);

  const soldItemsWithDays = analyzedProducts.filter(p => p.days_to_sell !== null);
  const avgDaysToSell = soldItemsWithDays.length > 0
    ? Math.round((soldItemsWithDays.reduce((sum, p) => sum + (p.days_to_sell || 0), 0) / soldItemsWithDays.length) * 10) / 10
    : 0;

  const avgDiscountPct = analyzedProducts.length > 0
    ? Math.round((analyzedProducts.reduce((sum, p) => sum + p.discount_pct, 0) / analyzedProducts.length) * 10) / 10
    : 0;

  const totalDailyRate = analyzedProducts.reduce((sum, p) => sum + p.daily_sales_rate, 0);
  const sevenDayForecastUnits = Math.round(totalDailyRate * 7);

  // Alerts
  const lowStockProducts = analyzedProducts
    .filter(p => p.stock < 5)
    .map(p => ({ id: p.id, name: p.name, stock: p.stock }));

  const expiringSoonProducts = analyzedProducts
    .filter(p => p.expiring_soon > 0)
    .map(p => ({ id: p.id, name: p.name, units: p.expiring_soon }));

  const expiredUnsoldProducts = analyzedProducts
    .filter(p => p.expired_unsold > 0)
    .map(p => ({ id: p.id, name: p.name, units: p.expired_unsold }));

  const reorderSoonProducts = analyzedProducts
    .filter(p => p.days_to_stock_out !== null && p.days_to_stock_out <= 3)
    .map(p => ({ id: p.id, name: p.name, days_left: p.days_to_stock_out! }));

  // Charts data
  const unitsByProduct = analyzedProducts.map(p => ({
    name: p.name.length > 18 ? p.name.substring(0, 16) + '..' : p.name,
    units_sold: p.units_sold,
    is_slow_mover: p.slow_mover
  })).sort((a, b) => b.units_sold - a.units_sold);

  // Daily sales trend
  const salesByDayMap: Record<string, { units: number; revenue: number }> = {};
  for (let d = periodDays - 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    const dayKey = day.toISOString().split('T')[0];
    salesByDayMap[dayKey] = { units: 0, revenue: 0 };
  }

  for (const u of allUnits) {
    if (u.status === 'sold' && u.sold_at) {
      const soldDay = u.sold_at.split(' ')[0] || u.sold_at.split('T')[0];
      if (salesByDayMap[soldDay]) {
        salesByDayMap[soldDay].units += 1;
        salesByDayMap[soldDay].revenue += (u.price_snapshot || 0);
      }
    }
  }

  const dailySalesTrend = Object.keys(salesByDayMap).sort().map(date => ({
    date: date.substring(5),
    units: salesByDayMap[date].units,
    revenue: salesByDayMap[date].revenue,
    is_forecast: false
  }));

  const avgDailyUnits = Math.max(1, Math.round(totalDailyRate));
  const avgDailyRev = totalUnitsSold > 0 ? Math.round((totalRevenue / totalUnitsSold) * avgDailyUnits) : 500;
  for (let i = 1; i <= 7; i++) {
    const fDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    dailySalesTrend.push({
      date: `+${i}d (${fDate.toISOString().substring(5, 10)})`,
      units: avgDailyUnits,
      revenue: avgDailyRev,
      is_forecast: true
    });
  }

  const sortedByRev = [...analyzedProducts].sort((a, b) => b.revenue - a.revenue);
  const topRevenue = sortedByRev.slice(0, 5).map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 13) + '..' : p.name,
    revenue: p.revenue
  }));
  const otherRevenue = sortedByRev.slice(5).reduce((acc, p) => acc + p.revenue, 0);
  if (otherRevenue > 0) {
    topRevenue.push({ name: 'Others', revenue: otherRevenue });
  }

  const summary: AnalysisSummary = {
    period_days: periodDays,
    total_units_sold: totalUnitsSold,
    total_revenue: totalRevenue,
    avg_days_to_sell: avgDaysToSell,
    avg_discount_pct: avgDiscountPct,
    seven_day_forecast_units: sevenDayForecastUnits,
    alerts: {
      low_stock: { count: lowStockProducts.length, products: lowStockProducts },
      expiring_soon: { count: expiringSoonProducts.length, products: expiringSoonProducts },
      expired_unsold: { count: expiredUnsoldProducts.length, products: expiredUnsoldProducts },
      reorder_soon: { count: reorderSoonProducts.length, products: reorderSoonProducts }
    },
    charts: {
      units_by_product: unitsByProduct,
      daily_sales_trend: dailySalesTrend,
      revenue_share: topRevenue
    }
  };

  return { products: analyzedProducts, summary };
}

export async function runAIDeepAnalysis(periodDays: number = 30, userId?: string) {
  const { products, summary } = computeProductAnalysis(periodDays);

  const inputPayload = JSON.stringify(products.map(p => ({
    id: p.id,
    stock: p.stock,
    sold: p.units_sold,
    rate: p.daily_sales_rate,
    health: p.health_score,
    exp: p.expired_unsold
  })));
  const inputHash = crypto.createHash('sha256').update(inputPayload + periodDays).digest('hex');

  const cached = db.prepare(`
    SELECT * FROM ai_reports 
    WHERE input_hash = ? AND period_days = ? 
      AND datetime(created_at, '+10 minutes') > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).get(inputHash, periodDays) as any;

  if (cached) {
    try {
      const parsedProducts = JSON.parse(cached.per_product);
      return {
        source: 'cached',
        summary: cached.summary,
        products: parsedProducts,
        created_at: cached.created_at
      };
    } catch (e) {
      // ignore
    }
  }

  // Retail Analyst Engine fallback
  const productInsights = products.map(p => {
    let verdict: 'Star' | 'Steady' | 'Watch' | 'Risk' | 'Dead stock' = 'Steady';
    let insight = '';
    let action = '';

    if (p.expired_unsold > 0) {
      verdict = 'Risk';
      insight = `${p.expired_unsold} units passed expiration on shelf, causing capital lockup.`;
      action = `Discard ${p.expired_unsold} expired units immediately to protect brand reputation.`;
    } else if (p.stock < 5 && p.daily_sales_rate > 0) {
      verdict = p.units_sold >= 15 ? 'Star' : 'Risk';
      insight = `Stock at ${p.stock} units with high velocity of ${p.daily_sales_rate}/day. Stock-out in ~${p.days_to_stock_out || 1}d.`;
      action = `Place urgent order for ${p.suggested_reorder || 15} units to prevent stock-out.`;
    } else if (p.expiring_soon > 0) {
      verdict = 'Watch';
      insight = `${p.expiring_soon} units expiring within 7 days. Current stock is ${p.stock} units.`;
      action = `Run a 15% flash sale or bundle discount to clear batch before expiry.`;
    } else if (p.units_sold === 0 || (p.slow_mover && p.stock > 10)) {
      verdict = p.units_sold === 0 ? 'Dead stock' : 'Watch';
      insight = `Only ${p.units_sold} units sold in ${periodDays} days, tying up ₹${p.stock * p.selling_price} in dead inventory.`;
      action = `Reposition to eye-level front shelf or bundle with fast-moving staples.`;
    } else if (p.units_sold >= 20 && p.trend === 'rising') {
      verdict = 'Star';
      insight = `Top seller generating ₹${p.revenue} with ${p.units_sold} units sold and rising momentum.`;
      action = `Maintain minimum 25 units buffer and negotiate bulk supplier discount.`;
    } else {
      verdict = 'Steady';
      insight = `Consistent performance with ${p.units_sold} units sold and healthy health score of ${p.health_score}/100.`;
      action = `Maintain routine restocking schedule of ${Math.max(5, p.suggested_reorder)} units.`;
    }

    return {
      id: p.id,
      verdict,
      insight,
      action
    };
  });

  const lowCount = summary.alerts.low_stock.count;
  const expiredCount = summary.alerts.expired_unsold.count;
  const wholeSummary = `QuickKart tracked ₹${summary.total_revenue.toLocaleString('en-IN')} in gross revenue across ${summary.total_units_sold} units in the last ${periodDays} days with ${summary.avg_discount_pct}% average margin discount. Store health is stable with ${summary.seven_day_forecast_units} units projected over the next 7 days, but requires immediate intervention on ${lowCount} low-stock lines and ${expiredCount} expired items. Priority should be given to replenishing fast-moving inventory while discounting batches approaching expiry.`;

  const reportId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO ai_reports (id, period_days, summary, per_product, input_hash, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    reportId,
    periodDays,
    wholeSummary,
    JSON.stringify(productInsights),
    inputHash,
    userId || null
  );

  return {
    source: 'generated',
    summary: wholeSummary,
    products: productInsights,
    created_at: new Date().toISOString()
  };
}
