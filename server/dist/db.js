import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
const dbPath = path.resolve(process.cwd(), 'quickkart.db');
export const db = new Database(dbPath);
// Enable WAL mode and foreign keys for high performance and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
export function initDatabase() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      staff_code    TEXT UNIQUE,                       -- mall ID used for cash approval
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','staff')),
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until  TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS displays (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_seen  TEXT,
      active     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      weight           TEXT,
      barcode          TEXT NOT NULL,
      photo_url        TEXT NOT NULL,
      mrp              REAL NOT NULL CHECK (mrp >= 0),
      selling_price    REAL NOT NULL CHECK (selling_price >= 0),
      manufacture_date TEXT,
      expiry_date      TEXT NOT NULL,
      created_by       TEXT REFERENCES users(id),
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at       TEXT,
      CHECK (selling_price <= mrp)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode ON products (barcode) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_products_name ON products (name) WHERE deleted_at IS NULL;

    CREATE TABLE IF NOT EXISTS baskets (
      id            TEXT PRIMARY KEY,
      display_id    TEXT NOT NULL REFERENCES displays(id),
      status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paying','paid','cancelled','expired')),
      phone         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS units (
      id               TEXT PRIMARY KEY,
      product_id       TEXT NOT NULL REFERENCES products(id),
      barcode          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'instock' CHECK (status IN ('instock','reserved','sold')),
      scanned_at       TEXT NOT NULL DEFAULT (datetime('now')),   -- stock-in time
      mrp_snapshot     REAL NOT NULL,
      expiry_snapshot  TEXT NOT NULL,
      price_snapshot   REAL NOT NULL,
      basket_id        TEXT REFERENCES baskets(id),
      reserved_at      TEXT,
      sold_at          TEXT,
      stocked_by       TEXT REFERENCES users(id),
      client_event_id  TEXT UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_units_open ON units (barcode, expiry_snapshot, scanned_at) WHERE status = 'instock';
    CREATE INDEX IF NOT EXISTS idx_units_product ON units (product_id, status);
    CREATE INDEX IF NOT EXISTS idx_units_sold ON units (sold_at) WHERE status = 'sold';

    CREATE TABLE IF NOT EXISTS display_scans (
      id          TEXT PRIMARY KEY,
      display_id  TEXT NOT NULL REFERENCES displays(id),
      basket_id   TEXT REFERENCES baskets(id),
      barcode     TEXT NOT NULL,
      product_id  TEXT REFERENCES products(id),
      unit_id     TEXT REFERENCES units(id),
      result      TEXT NOT NULL CHECK (result IN ('added','not_registered','out_of_stock')),
      scanned_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id              TEXT PRIMARY KEY,
      bill_no         INTEGER UNIQUE,
      basket_id       TEXT UNIQUE NOT NULL REFERENCES baskets(id),
      display_id      TEXT NOT NULL REFERENCES displays(id),
      customer_phone  TEXT NOT NULL,
      total           REAL NOT NULL,
      payment_method  TEXT NOT NULL CHECK (payment_method IN ('card','upi','cash')),
      gateway_ref     TEXT,
      approved_by     TEXT REFERENCES users(id),
      receipt_status  TEXT NOT NULL DEFAULT 'sent' CHECK (receipt_status IN ('pending','sent','failed')),
      paid_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_phone ON purchases (customer_phone, paid_at DESC);
    CREATE INDEX IF NOT EXISTS idx_purchases_time  ON purchases (paid_at DESC);

    CREATE TABLE IF NOT EXISTS purchase_items (
      id            TEXT PRIMARY KEY,
      purchase_id   TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      unit_id       TEXT NOT NULL REFERENCES units(id),
      product_id    TEXT NOT NULL REFERENCES products(id),
      barcode       TEXT NOT NULL,
      product_name  TEXT NOT NULL,
      price_paid    REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_barcode ON purchase_items (barcode);

    CREATE TABLE IF NOT EXISTS ai_reports (
      id           TEXT PRIMARY KEY,
      period_days  INTEGER NOT NULL,
      summary      TEXT NOT NULL,
      per_product  TEXT NOT NULL,
      input_hash   TEXT NOT NULL,
      created_by   TEXT REFERENCES users(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings VALUES ('low_stock_threshold','5');
    INSERT OR IGNORE INTO settings VALUES ('expiry_warning_days','7');
    INSERT OR IGNORE INTO settings VALUES ('timezone','Asia/Kolkata');
    INSERT OR IGNORE INTO settings VALUES ('welcome_seconds','4');
    INSERT OR IGNORE INTO settings VALUES ('basket_idle_minutes','5');
  `);
    seedVersion2Data();
}
function seedVersion2Data() {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count > 0)
        return;
    console.log('Seeding QuickKart Version 2 Data (Mall Admin, Staff, Displays, Products with Photos, Units & Customer Purchases)...');
    const adminHash = bcrypt.hashSync('admin123', 10);
    const staffHash = bcrypt.hashSync('staff123', 10);
    const adminId = uuidv4();
    const staffId = uuidv4();
    const insertUser = db.prepare(`
    INSERT INTO users (id, staff_code, email, password_hash, role) VALUES (?, ?, ?, ?, ?)
  `);
    insertUser.run(adminId, 'ADMIN01', 'admin@quickkart.com', adminHash, 'admin');
    insertUser.run(staffId, 'STAFF01', 'staff@quickkart.com', staffHash, 'staff');
    // Seed default display
    const displayId = uuidv4();
    db.prepare(`
    INSERT INTO displays (id, name, token_hash) VALUES (?, ?, ?)
  `).run(displayId, 'Entrance Kiosk Display 1', 'default_token_hash_display_1');
    // Helper date utilities
    const now = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    const formatDateTime = (d) => d.toISOString().replace('T', ' ').substring(0, 19);
    const addDays = (d, days) => {
        const copy = new Date(d);
        copy.setDate(copy.getDate() + days);
        return copy;
    };
    // Sample Products with High Quality Photos and Barcodes
    const sampleProducts = [
        {
            id: uuidv4(),
            name: 'Basmati Premium Royal Rice',
            weight: '5 kg',
            barcode: '8901234500101',
            photo_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
            mrp: 450,
            selling_price: 420,
            mfg: formatDate(addDays(now, -60)),
            exp: formatDate(addDays(now, 180)),
            inStockUnits: 14,
            soldUnits: 8
        },
        {
            id: uuidv4(),
            name: 'Amul Pure Pasteurized Butter',
            weight: '500 g',
            barcode: '8901234500201',
            photo_url: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80',
            mrp: 275,
            selling_price: 260,
            mfg: formatDate(addDays(now, -20)),
            exp: formatDate(addDays(now, 15)),
            inStockUnits: 3, // Low stock (< 5) to trigger alert
            soldUnits: 16
        },
        {
            id: uuidv4(),
            name: 'Tata Salt Vacuum Evaporated',
            weight: '1 kg',
            barcode: '8901234500301',
            photo_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80',
            mrp: 28,
            selling_price: 25,
            mfg: formatDate(addDays(now, -90)),
            exp: formatDate(addDays(now, 300)),
            inStockUnits: 25,
            soldUnits: 34
        },
        {
            id: uuidv4(),
            name: 'Maggi 2-Minute Masala Noodles',
            weight: '280 g (Pack of 4)',
            barcode: '8901234500401',
            photo_url: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=600&q=80',
            mrp: 60,
            selling_price: 54,
            mfg: formatDate(addDays(now, -40)),
            exp: formatDate(addDays(now, 120)),
            inStockUnits: 18,
            soldUnits: 42
        },
        {
            id: uuidv4(),
            name: 'Fortune Sunlite Sunflower Oil',
            weight: '1 L',
            barcode: '8901234500501',
            photo_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
            mrp: 165,
            selling_price: 150,
            mfg: formatDate(addDays(now, -50)),
            exp: formatDate(addDays(now, 4)), // Expiring soon (< 7 days)
            inStockUnits: 6,
            soldUnits: 12
        },
        {
            id: uuidv4(),
            name: 'Cadbury Dairy Milk Silk Chocolate',
            weight: '150 g',
            barcode: '8901234500601',
            photo_url: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&w=600&q=80',
            mrp: 185,
            selling_price: 175,
            mfg: formatDate(addDays(now, -120)),
            exp: formatDate(addDays(now, -2)), // Expired unsold
            inStockUnits: 2,
            soldUnits: 7
        },
        {
            id: uuidv4(),
            name: 'Colgate Total Active Dental Cream',
            weight: '200 g',
            barcode: '8901234500701',
            photo_url: 'https://images.unsplash.com/photo-1559591937-e10323979854?auto=format&fit=crop&w=600&q=80',
            mrp: 195,
            selling_price: 180,
            mfg: formatDate(addDays(now, -45)),
            exp: formatDate(addDays(now, 200)),
            inStockUnits: 11,
            soldUnits: 2 // Slow mover
        }
    ];
    const insertProduct = db.prepare(`
    INSERT INTO products (id, name, weight, barcode, photo_url, mrp, selling_price, manufacture_date, expiry_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertUnit = db.prepare(`
    INSERT INTO units (
      id, product_id, barcode, status, scanned_at, mrp_snapshot,
      expiry_snapshot, price_snapshot, basket_id, sold_at, stocked_by, client_event_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertBasket = db.prepare(`
    INSERT INTO baskets (id, display_id, status, phone, created_at, last_activity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    const insertPurchase = db.prepare(`
    INSERT INTO purchases (
      id, bill_no, basket_id, display_id, customer_phone, total, payment_method, gateway_ref, approved_by, receipt_status, paid_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertPurchaseItem = db.prepare(`
    INSERT INTO purchase_items (id, purchase_id, unit_id, product_id, barcode, product_name, price_paid)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    // Sample customers for the Customers tab
    const sampleCustomers = [
        { phone: '+91 98765 43210', method: 'upi', ref: 'UPI-REF-8921' },
        { phone: '+91 98111 22334', method: 'card', ref: 'CARD-TXN-4491' },
        { phone: '+91 97000 55667', method: 'cash', staff: staffId },
        { phone: '+91 98765 43210', method: 'upi', ref: 'UPI-REF-9941' }, // Repeat customer!
        { phone: '+91 99887 76655', method: 'card', ref: 'CARD-TXN-1029' }
    ];
    // Seed Products
    for (const prod of sampleProducts) {
        insertProduct.run(prod.id, prod.name, prod.weight, prod.barcode, prod.photo_url, prod.mrp, prod.selling_price, prod.mfg, prod.exp, adminId);
        // Seed in-stock units
        for (let i = 0; i < prod.inStockUnits; i++) {
            const daysAgo = Math.floor(Math.random() * 6);
            const scannedDate = addDays(now, -daysAgo);
            const unitBarcode = `${prod.barcode}-${100 + i}`;
            insertUnit.run(uuidv4(), prod.id, unitBarcode, 'instock', formatDateTime(scannedDate), prod.mrp, prod.exp, prod.selling_price, null, null, staffId, uuidv4());
        }
    }
    // Seed sample past purchases for Customers Tab & Sold Units
    for (let c = 0; c < sampleCustomers.length; c++) {
        const cust = sampleCustomers[c];
        const basketId = uuidv4();
        const purchaseId = uuidv4();
        const paidTime = formatDateTime(addDays(now, -(c + 1)));
        const billNo = 1001 + c;
        insertBasket.run(basketId, displayId, 'paid', cust.phone, paidTime, paidTime);
        // Pick 2 products for each basket
        const p1 = sampleProducts[c % sampleProducts.length];
        const p2 = sampleProducts[(c + 2) % sampleProducts.length];
        const items = [p1, p2];
        const totalAmount = items.reduce((sum, item) => sum + item.selling_price, 0);
        insertPurchase.run(purchaseId, billNo, basketId, displayId, cust.phone, totalAmount, cust.method, cust.ref || null, cust.staff || null, 'sent', paidTime);
        for (let idx = 0; idx < items.length; idx++) {
            const prod = items[idx];
            const unitId = uuidv4();
            const unitBarcode = `${prod.barcode}-SOLD-${c}-${idx}`;
            // Insert sold unit
            insertUnit.run(unitId, prod.id, unitBarcode, 'sold', formatDateTime(addDays(now, -(c + 5))), prod.mrp, prod.exp, prod.selling_price, basketId, paidTime, staffId, uuidv4());
            // Insert purchase item
            insertPurchaseItem.run(uuidv4(), purchaseId, unitId, prod.id, unitBarcode, prod.name, prod.selling_price);
        }
    }
    console.log('Seeded QuickKart Version 2 database successfully.');
}
export function getAllProductsWithStock(search = '') {
    const query = `
    SELECT 
      p.*,
      COUNT(u.id) as stock_count
    FROM products p
    LEFT JOIN units u 
      ON u.product_id = p.id AND u.status = 'instock'
    WHERE p.deleted_at IS NULL
      AND (p.name LIKE ? OR p.barcode LIKE ? OR p.weight LIKE ?)
    GROUP BY p.id
    ORDER BY p.name ASC
  `;
    const filter = `%${search.trim()}%`;
    return db.prepare(query).all(filter, filter, filter);
}
export function getProductById(id) {
    const query = `
    SELECT 
      p.*,
      COUNT(u.id) as stock_count
    FROM products p
    LEFT JOIN units u 
      ON u.product_id = p.id AND u.status = 'instock'
    WHERE p.id = ? AND p.deleted_at IS NULL
    GROUP BY p.id
  `;
    const row = db.prepare(query).get(id);
    return row || null;
}
export function getProductByBarcode(barcode) {
    const query = `
    SELECT 
      p.*,
      COUNT(u.id) as stock_count
    FROM products p
    LEFT JOIN units u 
      ON u.product_id = p.id AND u.status = 'instock'
    WHERE p.barcode = ? AND p.deleted_at IS NULL
    GROUP BY p.id
  `;
    const row = db.prepare(query).get(barcode.trim());
    return row || null;
}
// Low Stock Alerts (Stock < 5)
export function getLowStockAlerts(threshold = 5) {
    const query = `
    SELECT 
      p.id,
      p.name,
      p.barcode,
      p.photo_url,
      p.weight,
      p.selling_price,
      COUNT(u.id) as stock_count
    FROM products p
    LEFT JOIN units u 
      ON u.product_id = p.id AND u.status = 'instock'
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING stock_count < ?
    ORDER BY stock_count ASC, p.name ASC
  `;
    return db.prepare(query).all(threshold);
}
