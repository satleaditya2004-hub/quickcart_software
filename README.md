# QuickKart - Smart Stock. Faster Sales.

**QuickKart** is a responsive web application and PWA for small retail shops to track physical inventory and sales at the individual barcode level, implement concurrency-safe First-Expired, First-Out (FEFO) checkout, and obtain product-by-product AI intelligence.

---

## 🚀 Quick Start Guide

### 1. Start the Backend Server
In your terminal, navigate to the `server` directory and launch the API server:
```bash
cd server
npm run dev
```
*The server will initialize `quickkart.db` (SQLite in WAL mode) with default seed data, users, and realistic inventory history, running at `http://localhost:5000`.*

### 2. Start the Frontend Client
In a second terminal, navigate to the `client` directory and launch Vite:
```bash
cd client
npm run dev
```
*The client runs at `http://localhost:5173`.*

---

## 👥 Demo Accounts & Roles

QuickKart includes role-based access control with pre-seeded demo accounts. You can also click the quick role switcher buttons on the Login page:

| Role | Email | Password | Allowed Tabs |
|---|---|---|---|
| **Shop Owner** | `owner@quickkart.com` | `owner123` | **All 5 Tabs** (List, Scan, Data, Sell, Analysis) |
| **Stock Staff** | `staff@quickkart.com` | `staff123` | **List, Scan, Data** |
| **Cashier** | `cashier@quickkart.com` | `cashier123` | **Sell** (Checkout Terminal only) |

---

## 📱 Application Flow & Features

### Screen 1: Splash Screen
- Teal full-screen animation featuring the QuickKart cart logo and tagline: *"Smart stock. Faster sales."*
- Runs for ~1.5 seconds with an animated progress bar and a quick "Skip to Login" button.

### Screen 2: Login Page
- Two-panel responsive layout:
  - **Left Teal Panel**: Brand showcase, value proposition, and feature highlights (FEFO checkout, hardware barcode scanning, AI engine).
  - **Right Panel**: Email & password authentication with generic error handling, JWT auth, and 1-click test account switcher.
  - Automatically redirects Cashiers to the **Sell** tab, and Owners/Staff to the **List** tab.

### Header Navigation
- **Teal Header** (`#0F766E`) with QuickKart wordmark and active user role badge.
- Navigation tab bar with an **Amber underline** (`#F59E0B`) denoting the active screen.
- **Low-Stock Notification Bell**: Displays live badge counter for items with stock < 5; clicking opens a floating dropdown listing the items with one-click navigation to inspect details.
- **Active Scan Session Indicator**: Shows a live pulse when another device or tab has an active stocking session.
- **Dark Mode Toggle** & **Sign Out** button.

### Screen 3: List Tab (Inventory Catalog)
- **Search bar** with real-time text filtering.
- **Action Buttons**: `+ Register Product`, `Select All`, and `Delete` (soft-delete with safety confirmation: *"Delete N item(s)? History is kept."*).
- **Register / Edit Popup**:
  - Fields: Name, Weight, MRP, Selling Price, Manufacture Date, Expiry Date.
  - Validations: SP ≤ MRP, Expiry Date ≥ Manufacture Date, required fields.
  - Buttons: *Clear All*, *Save*, and *Cancel*.
- **Derived Stock Count**: Stock is strictly computed from unsold physical scan records—never typed by hand!
  - Color-coded badges: **Red** (< 5 units), **Amber** (5–9 units), **Teal** (≥ 10 units).
- **Edit & Info Actions**:
  - *Edit* updates details for future scans without altering historical scan snapshots.
  - *Info* displays a read-only popup with complete metadata, current stock, and last updated timestamp.

### Screen 4: Scan Tab (Stock-In Scanner)
- **Product Selector**: Search and select any product from the left pane.
- **Synced Session Controls**: `Scan Start` (green) and `Scan End` (red) buttons that synchronize live across tabs and devices.
- **Multiple Barcode Input Methods**:
  1. **USB Barcode Gun** (Keyboard Wedge: fast keystroke burst + Enter).
  2. **Bluetooth Handheld Scanner**.
  3. **Phone / Laptop Camera Scanner**: Uses `html5-qrcode` with an interactive viewfinder to scan physical product barcodes.
  4. **Manual Barcode Input** + *Simulate Scan* button for testing.
- **Snapshot Immutability**: Every unit scan creates a `scan_records` entry freezing the current MRP, selling price, and expiry date.
- **Auditory Feedback**: Web Audio API generates a high-pitch scan confirmation beep.

### Screen 5: Data Tab (Dual-Box Ledger)
- **Product Selector**: Choose a product and see its live unit-level barcode records.
- **Two Equal Boxes Side by Side**:
  - **Box 1: "In stock · ready to sell"**: Barcode, stock-in timestamp, MRP, selling price, and expiry date.
  - **Box 2: "Sold"**: Barcode, stock-in and sold timestamps, MRP, and the paid price.
- **Real-Time Inventory Updates**: Stock-in scans appear in Box 1; customer-display scans reserve available stock; completed purchases move units into Box 2. Basket cancellations and removed items return to Box 1 over WebSockets.

### Screen 6: Sell Tab (Checkout Terminal)
- **Continuous Listening**: Status indicator: *"Listening for checkout scanner"*.
- **Barcode Input**: Autofocused and listens for barcode gun scans or camera input.
- **Concurrency-Safe FEFO Matching**:
  - Automatically queries the oldest-expiry unsold unit matching the scanned barcode:
    ```sql
    SELECT * FROM scan_records
    WHERE barcode = ? AND sold_at IS NULL AND deleted_at IS NULL
    ORDER BY expiry_date_snapshot ASC, scanned_at ASC
    LIMIT 1;
    ```
  - Fills the `sold_at` timestamp on the same row (never duplicates rows).
  - Triggers a dual-tone cash register chime sound and toast notification.
  - If a barcode is not in stock or already sold, shows a clear error toast.
- **Full Ledger Table**:
  - 8 columns: Barcode, Product Name, Scan Date, Scan Time, MRP, Expiry Date, Selling Price, Selling Date, Selling Time.
  - Sold rows highlighted with a subtle green tint.

### Screen 7: Analysis Tab (AI & Forecast Engine)
- **Period Selector**: 7 Days, 30 Days, 90 Days.
- **Claude AI Analysis Button**:
  - Sends anonymized per-product statistics to the backend to generate a 3-sentence whole-shop summary, individual verdicts (`Star`, `Steady`, `Watch`, `Risk`, `Dead stock`), concise insights, and concrete retail actions.
  - Automatically falls back to the built-in deterministic retail analyst engine if offline or if no API key is set.
- **4 Alert Cards**:
  - *Low Stock* (< 5 units)
  - *Expiring Soon* (within 7 days)
  - *Expired Unsold* (past expiration)
  - *Reorder Soon* (predicted stock-out in ≤ 3 days)
- **4 Metric Summary Tiles**: Units Sold, Gross Revenue (₹), Avg Days to Sell, Avg Discount %.
- **3 Interactive Recharts Visualizations**:
  1. *Units Sold by Product* (Bar chart with slow movers highlighted in Amber `#F59E0B`).
  2. *Daily Sales & 7-Day Forecast* (Line chart with forecasted trend line).
  3. *Revenue Contribution* (Donut chart).
- **"Every Product, Analysed" Ranked Table**:
  - Covers **100% of products** in the shop (even items with 0 sales).
  - Columns: Product, Stock, Sold, Revenue, Stock-Out in (days), Trend (↗ ↘ →), Health Score (0–100 meter), Status Chip, Recommendation / AI Verdict & Action.
  - Default sorted by Health Score, worst first.

---

## 🛡️ Core Rules That Must Never Break

1. **Snapshot Immutability**: MRP, expiry date, and selling price are stamped once at scan-in and never change, even if product details are edited later.
2. **Derived Stock Count**: Stock is calculated strictly from unsold records (`sold_at IS NULL`); Data Box 1 count always equals product stock.
3. **Role Enforcement**: Endpoint-level middleware verifies roles on the server. Cashiers have access exclusively to the Sell tab.
4. **Concurrency-Safe FEFO**: Oldest expiring units are always sold first, preventing duplicate checkout under concurrent scans.
5. **Session Sync**: Scan and Data tabs stay continuously in sync via Socket.IO.
