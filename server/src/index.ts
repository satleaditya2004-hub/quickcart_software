import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { 
  initDatabase, 
  db, 
  getAllProductsWithStock, 
  getProductById, 
  getProductByBarcode,
  getLowStockAlerts,
  ProductRow,
  UnitRow
} from './db.js';
import { 
  generateTokens, 
  hashRefreshToken,
  matchesRefreshToken,
  verifyRefreshToken, 
  requireAuth, 
  requireRole, 
  AuthenticatedRequest 
} from './auth.js';
import { 
  computeProductAnalysis, 
  runAIDeepAnalysis 
} from './analysis.js';

dotenv.config();

// Initialize Database & Seed Version 2
initDatabase();

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

// Realtime WebSocket connections
io.on('connection', (socket) => {
  // connection established
});

function notifyClients(event: string, payload: any) {
  io.emit(event, payload);
}

// ----------------- AUTHENTICATION ROUTES (Admin & Staff Only) ----------------- //

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.trim().toLowerCase()) as any;

  if (!user) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  // Check lockout (Section 3.6: 5 failed attempts locks for 15 mins)
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
    return res.status(429).json({ error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).` });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    const failed = (user.failed_logins || 0) + 1;
    let lockedUntil = null;
    if (failed >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(failed, lockedUntil, user.id);

    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

  const tokens = generateTokens({ 
    id: user.id, 
    staff_code: user.staff_code, 
    email: user.email, 
    role: user.role 
  });

  const tokenHash = hashRefreshToken(tokens.refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    tokens.sessionId,
    user.id,
    tokenHash,
    expiresAt
  );

  return res.json({
    user: {
      id: user.id,
      staff_code: user.staff_code,
      email: user.email,
      role: user.role
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken
  });
});

app.post('/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const session = db.prepare(`
    SELECT id, token_hash, expires_at
    FROM refresh_tokens
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).get(payload.sessionId, payload.id) as { id: string; token_hash: string; expires_at: string } | undefined;
  if (!session || Date.parse(session.expires_at) <= Date.now() || !matchesRefreshToken(refreshToken, session.token_hash)) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = db.prepare('SELECT id, staff_code, email, role FROM users WHERE id = ? AND active = 1').get(payload.id) as any;
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const newTokens = generateTokens(user, session.id);
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE refresh_tokens SET token_hash = ?, expires_at = ? WHERE id = ?').run(
    hashRefreshToken(newTokens.refreshToken),
    newExpiresAt,
    session.id
  );
  return res.json({
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
    user
  });
});

app.post('/auth/logout', (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : null;
  const payload = refreshToken ? verifyRefreshToken(refreshToken) : null;
  if (payload && refreshToken) {
    const session = db.prepare(`
      SELECT id, token_hash
      FROM refresh_tokens
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).get(payload.sessionId, payload.id) as { id: string; token_hash: string } | undefined;
    if (session && matchesRefreshToken(refreshToken, session.token_hash)) {
      db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), session.id);
    }
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// ----------------- PRODUCT ROUTES (Admin & Staff) ----------------- //

app.get('/products', requireAuth, (req, res) => {
  const search = (req.query.search as string) || '';
  const products = getAllProductsWithStock(search);
  return res.json({ products });
});

app.post('/products', requireAuth, requireRole('admin', 'staff'), (req: AuthenticatedRequest, res) => {
  const { name, weight, barcode, photo_url, mrp, selling_price, manufacture_date, expiry_date } = req.body;

  if (typeof name !== 'string' || !name.trim() || typeof barcode !== 'string' || !barcode.trim() ||
      mrp === undefined || selling_price === undefined || typeof expiry_date !== 'string' || !expiry_date) {
    return res.status(400).json({ error: 'Name, Barcode, MRP, Selling Price, and Expiry Date are required' });
  }

  const numMrp = Number(mrp);
  const numSp = Number(selling_price);

  if (!Number.isFinite(numMrp) || !Number.isFinite(numSp) || numMrp < 0 || numSp < 0) {
    return res.status(400).json({ error: 'MRP and Selling Price must be valid non-negative numbers' });
  }

  if (numSp > numMrp) {
    return res.status(400).json({ error: 'Selling Price cannot be greater than MRP' });
  }

  if (manufacture_date && expiry_date < manufacture_date) {
    return res.status(400).json({ error: 'Expiry Date cannot be earlier than Manufacture Date' });
  }

  // Barcode uniqueness check (C9, MF-6)
  const existingBarcode = db.prepare('SELECT id FROM products WHERE barcode = ? AND deleted_at IS NULL').get(barcode.trim());
  if (existingBarcode) {
    return res.status(400).json({ error: `Barcode "${barcode}" is already assigned to another active product.` });
  }

  const id = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    INSERT INTO products (id, name, weight, barcode, photo_url, mrp, selling_price, manufacture_date, expiry_date, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name.trim(),
    weight?.trim() || null,
    barcode.trim(),
    typeof photo_url === 'string' ? photo_url.trim() : '',
    numMrp,
    numSp,
    manufacture_date || null,
    expiry_date,
    req.user!.id,
    now,
    now
  );

  const created = getProductById(id);
  // Realtime sync across all tabs and all displays (C10, MF-8)
  notifyClients('product:changed', { action: 'created', product: created });
  return res.status(201).json({ product: created });
});

app.put('/products/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Product ID is required' });
  }
  const { name, weight, barcode, photo_url, mrp, selling_price, manufacture_date, expiry_date } = req.body;

  const existing = getProductById(id);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const numMrp = Number(mrp);
  const numSp = Number(selling_price);

  if (!Number.isFinite(numMrp) || !Number.isFinite(numSp) || numMrp < 0 || numSp < 0) {
    return res.status(400).json({ error: 'MRP and Selling Price must be valid non-negative numbers' });
  }

  if (numSp > numMrp) {
    return res.status(400).json({ error: 'Selling Price cannot be greater than MRP' });
  }

  if (manufacture_date && expiry_date < manufacture_date) {
    return res.status(400).json({ error: 'Expiry Date cannot be earlier than Manufacture Date' });
  }

  // Barcode uniqueness check
  if (barcode && barcode.trim() !== existing.barcode) {
    const duplicate = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ? AND deleted_at IS NULL').get(barcode.trim(), id);
    if (duplicate) {
      return res.status(400).json({ error: `Barcode "${barcode}" is already assigned to another active product.` });
    }
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    UPDATE products
    SET name = ?, weight = ?, barcode = ?, photo_url = ?, mrp = ?, selling_price = ?, manufacture_date = ?, expiry_date = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name.trim(),
    weight?.trim() || null,
    barcode ? barcode.trim() : existing.barcode,
    typeof photo_url === 'string' ? photo_url.trim() : existing.photo_url,
    numMrp,
    numSp,
    manufacture_date || null,
    expiry_date,
    now,
    id
  );

  const updated = getProductById(id);
  notifyClients('product:changed', { action: 'updated', product: updated });
  return res.json({ product: updated });
});

app.get('/products/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Product ID is required' });
  }
  const product = getProductById(id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  return res.json({ product });
});

app.delete('/products', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Array of product IDs is required' });
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const deleteStmt = db.prepare('UPDATE products SET deleted_at = ? WHERE id = ?');

  const deletedCount = db.transaction(() => {
    let count = 0;
    for (const id of ids) {
      const result = deleteStmt.run(now, id);
      count += result.changes;
    }
    return count;
  })();

  notifyClients('product:changed', { action: 'deleted', ids });
  return res.json({ success: true, count: deletedCount });
});

// ----------------- STOCK-IN SCANNING (Staff Only) (MF-9) ----------------- //

app.post('/stock-in', requireAuth, requireRole('staff'), (req: AuthenticatedRequest, res) => {
  const { productId, barcode, clientEventId } = req.body;

  if (!productId || !barcode) {
    return res.status(400).json({ error: 'Product ID and Barcode are required' });
  }

  const product = getProductById(productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found or deleted' });
  }

  // Idempotency check via clientEventId
  if (clientEventId) {
    const existing = db.prepare('SELECT * FROM units WHERE client_event_id = ?').get(clientEventId);
    if (existing) {
      return res.json({ unit: existing, idempotent: true });
    }
  }

  const unitId = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  // Snapshot values are frozen at scan-in (D5)
  db.prepare(`
    INSERT INTO units (
      id, product_id, barcode, status, scanned_at, mrp_snapshot,
      expiry_snapshot, price_snapshot, stocked_by, client_event_id
    ) VALUES (?, ?, ?, 'instock', ?, ?, ?, ?, ?, ?)
  `).run(
    unitId,
    product.id,
    barcode.trim(),
    now,
    product.mrp,
    product.expiry_date,
    product.selling_price,
    req.user!.id,
    clientEventId || null
  );

  const newUnit = db.prepare(`
    SELECT u.*, p.name as product_name, p.photo_url
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE u.id = ?
  `).get(unitId) as UnitRow;

  notifyClients('unit:stocked', newUnit);

  const lowStock = getLowStockAlerts(5);
  notifyClients('stock:low', { count: lowStock.length, items: lowStock });

  return res.status(201).json({ unit: newUnit });
});

// Checkout one available unit, choosing the earliest expiry first.
app.post('/checkout', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const barcode = typeof req.body.barcode === 'string' ? req.body.barcode.trim() : '';
  if (!barcode) {
    return res.status(400).json({ error: 'Barcode is required' });
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const soldUnit = db.transaction(() => {
    const candidate = db.prepare(`
      SELECT u.id, u.product_id, u.barcode, u.price_snapshot, p.name AS product_name
      FROM units u
      JOIN products p ON p.id = u.product_id
      WHERE u.barcode = ? AND u.status = 'instock' AND p.deleted_at IS NULL
      ORDER BY u.expiry_snapshot ASC, u.scanned_at ASC
      LIMIT 1
    `).get(barcode) as {
      id: string;
      product_id: string;
      barcode: string;
      price_snapshot: number;
      product_name: string;
    } | undefined;

    if (!candidate) return null;
    const updated = db.prepare(`
      UPDATE units SET status = 'sold', sold_at = ?
      WHERE id = ? AND status = 'instock'
    `).run(now, candidate.id);
    return updated.changes === 1 ? candidate : null;
  })();

  if (!soldUnit) {
    return res.status(409).json({ error: 'Barcode is not in stock or has already been sold' });
  }

  const currentProduct = getProductById(soldUnit.product_id);
  const record = {
    id: soldUnit.id,
    barcode: soldUnit.barcode,
    product_name: soldUnit.product_name,
    selling_price_snapshot: soldUnit.price_snapshot
  };
  const currentStock = currentProduct?.stock_count ?? 0;
  notifyClients('sale:completed', { record, current_stock: currentStock });
  notifyClients('unit:sold', { product_id: soldUnit.product_id, current_stock: currentStock });
  return res.json({ record, current_stock: currentStock });
});

// ----------------- SCAN FEED (Live reads from digital displays) (MF-9) ----------------- //

app.get('/scan-feed', requireAuth, requireRole('staff'), (req, res) => {
  const query = `
    SELECT 
      ds.id,
      ds.barcode,
      ds.result,
      ds.scanned_at,
      d.name as display_name,
      p.name as product_name,
      p.photo_url
    FROM display_scans ds
    JOIN displays d ON d.id = ds.display_id
    LEFT JOIN products p ON p.id = ds.product_id
    ORDER BY ds.scanned_at DESC
    LIMIT 100
  `;
  const scans = db.prepare(query).all();
  return res.json({ scans });
});

// ----------------- DATA TAB BOXES (Box 1: In-Stock, Box 2: Sold) (MF-10) ----------------- //

app.get('/units', requireAuth, (req, res) => {
  const { productId, status } = req.query;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  let query = `
    SELECT 
      u.id, u.product_id, u.barcode, u.status, u.scanned_at, u.sold_at,
      u.mrp_snapshot, u.expiry_snapshot, u.price_snapshot,
      p.name as product_name, p.photo_url
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE u.product_id = ?
  `;

  if (status === 'instock') {
    query += ` AND u.status = 'instock' ORDER BY u.scanned_at DESC`;
  } else if (status === 'sold') {
    query += ` AND u.status = 'sold' ORDER BY u.sold_at DESC`;
  } else {
    query += ` ORDER BY u.scanned_at DESC`;
  }

  const units = db.prepare(query).all(productId as string);
  return res.json({ units, count: units.length });
});

// ----------------- SELL TAB LEDGER (MF-11) ----------------- //

app.get('/ledger', requireAuth, (req, res) => {
  const search = (req.query.search as string) || '';

  const query = `
    SELECT 
      u.id,
      u.barcode,
      p.name as product_name,
      p.photo_url,
      u.scanned_at,
      u.sold_at,
      u.mrp_snapshot,
      u.expiry_snapshot,
      u.price_snapshot,
      u.status
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE (u.barcode LIKE ? OR p.name LIKE ?)
    ORDER BY u.scanned_at DESC
    LIMIT 200
  `;

  const filter = `%${search.trim()}%`;
  const records = db.prepare(query).all(filter, filter);

  const formatted = records.map((r: any) => {
    const scanParts = (r.scanned_at || '').split(' ');
    const sellParts = (r.sold_at || '').split(' ');
    return {
      id: r.id,
      barcode: r.barcode,
      product_name: r.product_name,
      photo_url: r.photo_url,
      scan_date: scanParts[0] || '—',
      scan_time: scanParts[1] ? scanParts[1].substring(0, 5) : '—',
      mrp: r.mrp_snapshot,
      expiry_date: r.expiry_snapshot,
      selling_price: r.price_snapshot,
      selling_date: sellParts[0] || null,
      selling_time: sellParts[1] ? sellParts[1].substring(0, 5) : null,
      is_sold: r.status === 'sold'
    };
  });

  return res.json({ records: formatted });
});

// ----------------- CUSTOMERS TAB (Admin Only) (C8, MF-13, MF-14) ----------------- //

app.get('/customers', requireAuth, requireRole('admin'), (req, res) => {
  const search = (req.query.search as string) || '';

  const query = `
    SELECT 
      p.id,
      p.bill_no,
      p.customer_phone,
      p.total,
      p.payment_method,
      p.gateway_ref,
      p.receipt_status,
      p.paid_at,
      d.name as display_name,
      u.staff_code as approved_by_code
    FROM purchases p
    JOIN displays d ON d.id = p.display_id
    LEFT JOIN users u ON u.id = p.approved_by
    WHERE (
      p.customer_phone LIKE ? 
      OR CAST(p.bill_no AS TEXT) LIKE ?
      OR p.id IN (
        SELECT purchase_id FROM purchase_items WHERE barcode LIKE ? OR product_name LIKE ?
      )
    )
    ORDER BY p.paid_at DESC
    LIMIT 200
  `;

  const filter = `%${search.trim()}%`;
  const purchases = db.prepare(query).all(filter, filter, filter, filter) as any[];

  // Attach items for each purchase
  const getItemsStmt = db.prepare(`
    SELECT id, barcode, product_name, price_paid
    FROM purchase_items
    WHERE purchase_id = ?
  `);

  const results = purchases.map(p => ({
    ...p,
    items: getItemsStmt.all(p.id)
  }));

  return res.json({ purchases: results });
});

app.get('/customers/:purchaseId', requireAuth, requireRole('admin'), (req, res) => {
  const query = `
    SELECT 
      p.id,
      p.bill_no,
      p.customer_phone,
      p.total,
      p.payment_method,
      p.gateway_ref,
      p.receipt_status,
      p.paid_at,
      d.name as display_name,
      u.staff_code as approved_by_code,
      u.email as approved_by_email
    FROM purchases p
    JOIN displays d ON d.id = p.display_id
    LEFT JOIN users u ON u.id = p.approved_by
    WHERE p.id = ?
  `;
  const purchase = db.prepare(query).get(req.params.purchaseId) as any;
  if (!purchase) {
    return res.status(404).json({ error: 'Purchase record not found' });
  }

  const items = db.prepare(`
    SELECT pi.id, pi.barcode, pi.product_name, pi.price_paid, p.photo_url
    FROM purchase_items pi
    LEFT JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = ?
  `).all(purchase.id);

  return res.json({ purchase: { ...purchase, items } });
});

// Repeat customer analysis summary (MF-14)
app.get('/customers/by-phone/:phone', requireAuth, requireRole('admin'), (req, res) => {
  const phone = req.params.phone;

  const purchases = db.prepare(`
    SELECT id, bill_no, total, payment_method, paid_at
    FROM purchases
    WHERE customer_phone = ?
    ORDER BY paid_at DESC
  `).all(phone) as any[];

  const totalSpent = purchases.reduce((sum, p) => sum + p.total, 0);

  return res.json({
    phone,
    totalVisits: purchases.length,
    lifetimeSpend: totalSpent,
    purchases
  });
});

// ----------------- NOTIFICATIONS ----------------- //

app.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const lowStock = getLowStockAlerts(5);
  
  // Admin receives purchase count notifications
  let recentPurchasesCount = 0;
  if (req.user?.role === 'admin') {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM purchases 
      WHERE paid_at >= datetime('now', '-24 hours')
    `).get() as { count: number };
    recentPurchasesCount = row.count;
  }

  return res.json({
    lowStock: { count: lowStock.length, items: lowStock },
    recentPurchases: { count: recentPurchasesCount }
  });
});

// ----------------- ANALYSIS & AI (Admin & Staff) (MF-12) ----------------- //

app.get('/analysis/products', requireAuth, (req, res) => {
  const days = Number(req.query.days) || 30;
  const { products } = computeProductAnalysis(days);
  return res.json({ products });
});

app.get('/analysis/summary', requireAuth, (req, res) => {
  const days = Number(req.query.days) || 30;
  const { summary } = computeProductAnalysis(days);
  return res.json({ summary });
});

app.get('/analysis/trend', requireAuth, (req, res) => {
  const days = Number(req.query.days) || 30;
  const { summary } = computeProductAnalysis(days);
  return res.json({ trend: summary.charts.daily_sales_trend });
});

app.post('/analysis/ai', requireAuth, async (req: AuthenticatedRequest, res) => {
  const days = Number(req.query.days) || 30;
  try {
    const report = await runAIDeepAnalysis(days, req.user?.id);
    return res.json({ report });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to complete AI analysis', details: err?.message });
  }
});

// ========================================================================= //
// ==================== DIGITAL DISPLAY API (Kiosk Touch) =================== //
// ========================================================================= //

// 1. Start a basket session when customer taps "Are you ready for shopping?" (DF-2, DF-3)
app.post('/display/baskets', (req, res) => {
  const defaultDisplay = db.prepare('SELECT id FROM displays LIMIT 1').get() as { id: string } | undefined;
  if (!defaultDisplay) {
    return res.status(503).json({ error: 'No display is configured' });
  }
  const requestedDisplayId = req.body?.displayId;
  if (requestedDisplayId !== undefined && typeof requestedDisplayId !== 'string') {
    return res.status(400).json({ error: 'Display ID must be a string' });
  }
  const displayId = requestedDisplayId || defaultDisplay.id;
  const display = db.prepare('SELECT id FROM displays WHERE id = ? AND active = 1').get(displayId);
  if (!display) {
    return res.status(400).json({ error: 'Display is not configured or is inactive' });
  }
  const basketId = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    INSERT INTO baskets (id, display_id, status, created_at, last_activity)
    VALUES (?, ?, 'open', ?, ?)
  `).run(basketId, displayId, now, now);

  return res.status(201).json({
    basketId,
    displayId,
    status: 'open'
  });
});

// 2. Barcode Scanned on Digital Display (DF-4, DF-5, DF-7, DF-8, 3.4)
app.post('/display/scan', (req, res) => {
  const { barcode, basketId } = req.body;

  if (typeof barcode !== 'string' || !barcode.trim() || typeof basketId !== 'string' || !basketId.trim()) {
    return res.status(400).json({ error: 'Barcode and basketId are required' });
  }

  const basket = db.prepare('SELECT * FROM baskets WHERE id = ?').get(basketId) as any;
  if (!basket || basket.status !== 'open') {
    return res.status(409).json({ error: 'Shopping basket is not open' });
  }
  const displayId = basket.display_id;

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const scanId = uuidv4();

  // Step A: Check if barcode is registered
  const scannedBarcode = barcode.trim();
  const product = db.prepare(`
    SELECT p.*,
      (
        SELECT COUNT(*)
        FROM units available
        WHERE available.product_id = p.id AND available.status = 'instock'
      ) AS stock_count
    FROM products p
    JOIN units scanned_unit ON scanned_unit.product_id = p.id
    WHERE scanned_unit.barcode = ? AND p.deleted_at IS NULL
    GROUP BY p.id
    LIMIT 1
  `).get(scannedBarcode) as (ProductRow & { stock_count: number }) | undefined
    || getProductByBarcode(scannedBarcode);
  if (!product) {
    // Unregistered barcode (DF-8)
    db.prepare(`
      INSERT INTO display_scans (id, display_id, basket_id, barcode, result, scanned_at)
      VALUES (?, ?, ?, ?, 'not_registered', ?)
    `).run(scanId, displayId, basketId, barcode.trim(), now);

    notifyClients('scan:received', {
      time: now,
      display_name: 'Display 1',
      barcode: barcode.trim(),
      product_name: 'Unknown Barcode',
      result: 'not_registered'
    });

    return res.status(404).json({
      result: 'not_registered',
      message: 'Product not found, please ask staff'
    });
  }

  // Step B: Concurrency-Safe Unit Reservation (Oldest Expiry First - FEFO) (D3, D10, 3.4)
  const reservationResult = db.transaction(() => {
    const candidate = db.prepare(`
      SELECT * FROM units
      WHERE product_id = ? AND barcode = ? AND status = 'instock'
      ORDER BY expiry_snapshot ASC, scanned_at ASC
      LIMIT 1
    `).get(product.id, scannedBarcode) as UnitRow | undefined;

    if (!candidate) {
      return null;
    }

    db.prepare(`
      UPDATE units
      SET status = 'reserved', basket_id = ?, reserved_at = ?
      WHERE id = ?
    `).run(basketId, now, candidate.id);

    return candidate;
  })();

  if (!reservationResult) {
    // Out of Stock (6.6)
    db.prepare(`
      INSERT INTO display_scans (id, display_id, basket_id, barcode, product_id, result, scanned_at)
      VALUES (?, ?, ?, ?, ?, 'out_of_stock', ?)
    `).run(scanId, displayId, basketId, barcode.trim(), product.id, now);

    notifyClients('scan:received', {
      time: now,
      display_name: 'Display 1',
      barcode: barcode.trim(),
      product_name: product.name,
      result: 'out_of_stock'
    });

    return res.status(400).json({
      result: 'out_of_stock',
      message: 'Out of stock'
    });
  }

  // Step C: Unit reserved successfully
  db.prepare(`
    INSERT INTO display_scans (id, display_id, basket_id, barcode, product_id, unit_id, result, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, 'added', ?)
  `).run(scanId, displayId, basketId, barcode.trim(), product.id, reservationResult.id, now);

  // Update basket last_activity
  db.prepare('UPDATE baskets SET last_activity = ? WHERE id = ?').run(now, basketId);

  notifyClients('unit:reserved', {
    id: reservationResult.id,
    product_id: product.id,
    barcode: reservationResult.barcode
  });

  // Get current quantity of this product in basket
  const countRow = db.prepare(`
    SELECT COUNT(*) as quantity FROM units
    WHERE basket_id = ? AND product_id = ? AND status = 'reserved'
  `).get(basketId, product.id) as { quantity: number };

  notifyClients('scan:received', {
    time: now,
    display_name: 'Display 1',
    barcode: barcode.trim(),
    product_name: product.name,
    result: 'added'
  });

  return res.json({
    result: 'added',
    product: {
      id: product.id,
      name: product.name,
      weight: product.weight,
      barcode: product.barcode,
      photo_url: product.photo_url,
      mrp: product.mrp,
      selling_price: product.selling_price,
      expiry_date: product.expiry_date,
      quantity: countRow.quantity
    }
  });
});

// 3. Remove an item / decrease quantity in basket
app.delete('/display/baskets/:id/items/:barcode', (req, res) => {
  const basketId = req.params.id;
  const barcode = req.params.barcode;
  if (typeof basketId !== 'string' || typeof barcode !== 'string') {
    return res.status(400).json({ error: 'Basket ID and barcode are required' });
  }
  const basket = db.prepare("SELECT id FROM baskets WHERE id = ? AND status = 'open'").get(basketId);
  if (!basket) return res.status(404).json({ error: 'Open basket not found' });

  const product = getProductByBarcode(barcode);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // Release one reserved unit back to instock
  const unit = db.prepare(`
    SELECT id FROM units
    WHERE basket_id = ? AND product_id = ? AND status = 'reserved'
    ORDER BY reserved_at DESC
    LIMIT 1
  `).get(basketId, product.id) as { id: string } | undefined;

  if (!unit) {
    return res.status(404).json({ error: 'No matching item remains in this basket' });
  }
  if (unit) {
    db.prepare(`
      UPDATE units
      SET status = 'instock', basket_id = NULL, reserved_at = NULL
      WHERE id = ?
    `).run(unit.id);
    notifyClients('units:released', { productId: product.id });
  }

  return res.json({ success: true });
});

// 4. End Shopping: Cancels basket and releases all items back to stock (DF-10, D8)
app.post('/display/baskets/:id/cancel', (req, res) => {
  const basketId = req.params.id;
  if (typeof basketId !== 'string') {
    return res.status(400).json({ error: 'Basket ID is required' });
  }

  db.transaction(() => {
    // Release all reserved units
    db.prepare(`
      UPDATE units
      SET status = 'instock', basket_id = NULL, reserved_at = NULL
      WHERE basket_id = ? AND status = 'reserved'
    `).run(basketId);

    db.prepare(`
      UPDATE baskets
      SET status = 'cancelled'
      WHERE id = ?
    `).run(basketId);
  })();

  notifyClients('units:released', { basketId });
  return res.json({ success: true, message: 'Basket cancelled and units returned to stock.' });
});

// 5. Enter Customer Mobile Number (DF-11)
app.post('/display/baskets/:id/phone', (req, res) => {
  const basketId = req.params.id;
  if (typeof basketId !== 'string') {
    return res.status(400).json({ error: 'Basket ID is required' });
  }
  const phone = req.body?.phone;

  if (typeof phone !== 'string' || phone.trim().length < 8) {
    return res.status(400).json({ error: 'Please enter a valid mobile number for your WhatsApp receipt.' });
  }

  const updated = db.prepare(`
    UPDATE baskets SET phone = ?, status = 'paying'
    WHERE id = ? AND status = 'open'
  `).run(phone.trim(), basketId);
  if (updated.changes === 0) {
    return res.status(404).json({ error: 'Open basket not found' });
  }
  return res.json({ success: true, phone: phone.trim() });
});

// 6. Complete Online Payment (Card / UPI) (DF-12, DF-14, 3.5)
app.post('/display/baskets/:id/pay', (req, res) => {
  const basketId = req.params.id;
  if (typeof basketId !== 'string') {
    return res.status(400).json({ error: 'Basket ID is required' });
  }
  const { paymentMethod } = req.body; // 'card' | 'upi'

  if (!['card', 'upi'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Invalid payment method' });
  }

  const basket = db.prepare('SELECT * FROM baskets WHERE id = ?').get(basketId) as any;
  if (!basket) return res.status(404).json({ error: 'Basket not found' });
  if (basket.status !== 'paying' && basket.status !== 'open') {
    return res.status(409).json({ error: 'Basket is no longer available for payment' });
  }

  // Get all reserved units
  const reservedUnits = db.prepare(`
    SELECT u.*, p.name as product_name
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE u.basket_id = ? AND u.status = 'reserved'
  `).all(basketId) as any[];

  if (reservedUnits.length === 0) {
    return res.status(400).json({ error: 'Basket is empty' });
  }

  const total = reservedUnits.reduce((acc, u) => acc + u.price_snapshot, 0);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const purchaseId = uuidv4();
  const gatewayRef = `${paymentMethod.toUpperCase()}-REF-${Math.floor(100000 + Math.random() * 900000)}`;

  // Transaction: Mark units sold, insert purchase & purchase items, mark basket paid
  const purchase = db.transaction(() => {
    // Update units
    db.prepare(`
      UPDATE units
      SET status = 'sold', sold_at = ?
      WHERE basket_id = ? AND status = 'reserved'
    `).run(now, basketId);

    const nextBillNoRow = db.prepare('SELECT COALESCE(MAX(bill_no), 1000) + 1 as next_no FROM purchases').get() as { next_no: number };
    const billNo = nextBillNoRow.next_no;

    // Insert purchase
    const insertPurch = db.prepare(`
      INSERT INTO purchases (
        id, bill_no, basket_id, display_id, customer_phone, total, payment_method, gateway_ref, approved_by, receipt_status, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'sent', ?)
    `);
    insertPurch.run(
      purchaseId,
      billNo,
      basketId,
      basket.display_id,
      basket.phone || 'Walk-in Customer',
      total,
      paymentMethod,
      gatewayRef,
      now
    );

    // Insert purchase items
    const insertItem = db.prepare(`
      INSERT INTO purchase_items (id, purchase_id, unit_id, product_id, barcode, product_name, price_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of reservedUnits) {
      insertItem.run(
        uuidv4(),
        purchaseId,
        u.id,
        u.product_id,
        u.barcode,
        u.product_name,
        u.price_snapshot
      );
    }

    db.prepare(`UPDATE baskets SET status = 'paid' WHERE id = ?`).run(basketId);

    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  })();

  // Broadcast purchase completed to update Data Tab Box 2, Sell Tab, and Admin Customers Tab!
  notifyClients('purchase:completed', { purchase, items: reservedUnits });
  notifyClients('alert:purchase', { bill_no: (purchase as any).bill_no, total, phone: basket.phone });

  return res.json({
    success: true,
    purchase,
    gatewayRef,
    message: 'Payment done! WhatsApp receipt has been dispatched.'
  });
});

// 7. Staff Cash Approval for Display (DF-13, 3.5, 3.6)
app.post('/display/baskets/:id/cash-approval', (req, res) => {
  const basketId = req.params.id;
  if (typeof basketId !== 'string') {
    return res.status(400).json({ error: 'Basket ID is required' });
  }
  const staffCode = req.body?.staffCode;
  const password = req.body?.password;

  if (typeof staffCode !== 'string' || !staffCode.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Mall Staff ID and Password are required' });
  }

  // Verify staff credentials
  const staff = db.prepare('SELECT * FROM users WHERE staff_code = ? AND active = 1').get(staffCode.trim().toUpperCase()) as any;
  if (!staff) {
    return res.status(401).json({ error: 'Invalid Shopping Mall Staff ID' });
  }

  const validPassword = bcrypt.compareSync(password, staff.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Incorrect Staff Password' });
  }

  const basket = db.prepare('SELECT * FROM baskets WHERE id = ?').get(basketId) as any;
  if (!basket) return res.status(404).json({ error: 'Basket not found' });
  if (basket.status !== 'paying' && basket.status !== 'open') {
    return res.status(409).json({ error: 'Basket is no longer available for payment' });
  }

  const reservedUnits = db.prepare(`
    SELECT u.*, p.name as product_name
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE u.basket_id = ? AND u.status = 'reserved'
  `).all(basketId) as any[];

  if (reservedUnits.length === 0) {
    return res.status(400).json({ error: 'Basket is empty' });
  }

  const total = reservedUnits.reduce((acc, u) => acc + u.price_snapshot, 0);
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const purchaseId = uuidv4();

  const purchase = db.transaction(() => {
    db.prepare(`
      UPDATE units
      SET status = 'sold', sold_at = ?
      WHERE basket_id = ? AND status = 'reserved'
    `).run(now, basketId);

    const nextBillNoRow = db.prepare('SELECT COALESCE(MAX(bill_no), 1000) + 1 as next_no FROM purchases').get() as { next_no: number };
    const billNo = nextBillNoRow.next_no;

    db.prepare(`
      INSERT INTO purchases (
        id, bill_no, basket_id, display_id, customer_phone, total, payment_method, approved_by, receipt_status, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, 'sent', ?)
    `).run(
      purchaseId,
      billNo,
      basketId,
      basket.display_id,
      basket.phone || 'Walk-in Customer',
      total,
      staff.id,
      now
    );

    const insertItem = db.prepare(`
      INSERT INTO purchase_items (id, purchase_id, unit_id, product_id, barcode, product_name, price_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of reservedUnits) {
      insertItem.run(
        uuidv4(),
        purchaseId,
        u.id,
        u.product_id,
        u.barcode,
        u.product_name,
        u.price_snapshot
      );
    }

    db.prepare(`UPDATE baskets SET status = 'paid' WHERE id = ?`).run(basketId);

    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  })();

  notifyClients('purchase:completed', { purchase, items: reservedUnits });
  notifyClients('alert:purchase', { bill_no: (purchase as any).bill_no, total, phone: basket.phone });

  return res.json({
    success: true,
    purchase,
    approvedBy: staff.staff_code,
    message: 'Payment approved! Cash received and receipt dispatched.'
  });
});

// 8. Get current basket status
app.get('/display/baskets/:id', (req, res) => {
  const basketId = req.params.id;
  const basket = db.prepare('SELECT * FROM baskets WHERE id = ?').get(basketId);
  if (!basket) return res.status(404).json({ error: 'Basket not found' });

  const items = db.prepare(`
    SELECT 
      p.id, p.name, p.weight, p.barcode, p.photo_url, p.mrp, p.selling_price, p.expiry_date,
      COUNT(u.id) as quantity,
      SUM(u.price_snapshot) as subtotal
    FROM units u
    JOIN products p ON p.id = u.product_id
    WHERE u.basket_id = ? AND u.status = 'reserved'
    GROUP BY p.id
  `).all(basketId);

  const total = items.reduce((acc: number, item: any) => acc + item.subtotal, 0);

  return res.json({ basket, items, total });
});

// Health check
app.get('/health', (req, res) => {
  return res.json({ status: 'ok', version: '2.0', app: 'QuickKart Shopping Mall & Display Engine' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`QuickKart Mall & Display Engine running on http://localhost:${PORT}`);
});
