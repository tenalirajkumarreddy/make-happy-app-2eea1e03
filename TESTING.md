# Manual Testing Guide for New Features

This guide outlines the steps to verify the newly implemented features in the BizManager application (Inventory, Banners, Mobile Stock, Reporting).

## 1. Inventory Management (Web)

**Goal:** Verify that stock can be adjusted and tracks correctly.

1.  **Navigate to Inventory:**
    *   Log in as `super_admin`.
    *   Click "Inventory" in the sidebar.
2.  **Verify Stock Levels:**
    *   Check if products are listed with current stock counts.
3.  **Adjust Stock:**
    *   Click "New Adjustment".
    *   Select a product (e.g., "Bisleri 500ml").
    *   Choose "Purchase (In)" or "Correction (+/-)".
    *   Enter a quantity (e.g., `+100`).
    *   Click "Save".
4.  **Confirm Update:**
    *   The "Stock" column for that product should increase by 100 instantly.
    *   The "Recent Movements" table at the bottom should show a new row for this adjustment.

## 2. Promotional Banners (Web & Mobile)

**Goal:** Verify admins can publish banners and customers/agents see them.

1.  **Create Banner (Web):**
    *   Go to "Banners" in the sidebar.
    *   Click "New Banner".
    *   Upload an image and set a title (e.g., "Summer Sale").
    *   Set it to "Active".
2.  **Verify on Mobile:**
    *   Open the Mobile App (or resize browser to mobile view if testing web responsive).
    *   Log in as a `customer` or `agent`.
    *   The new banner should appear in the carousel at the top of the Home Dashboard.

## 3. Mobile Stock Control (Mobile Agent App)

**Goal:** Verify that agents cannot oversell products.

1.  **Check Stock:**
    *   On the Web Inventory page, note the stock for a product (e.g., "Product A" has 50 items).
2.  **Attempt Oversell (Mobile):**
    *   Log in as `agent` on mobile.
    *   Go to "Record Transaction" (scan or select store).
    *   Select "Product A".
    *   Try to increase quantity to **51**.
3.  **Result:**
    *   The app should show a toast error: *"Cannot exceed stock of 50"*.
    *   The quantity should not increment beyond 50.

## 4. Sales Forecast (Web Analytics)

**Goal:** Verify the sales projection algorithm.

1.  **Navigate to Analytics:**
    *   Go to "Analytics" in the sidebar.
    *   Click the "Sales Forecast" tab.
2.  **Check Data:**
    *   If you have sufficient sales history (>= 5 days), a dotted line graph should appear projecting future sales.
    *   Hover over the dotted line to see the "Forecast" values.
    *   *Note: If data is insufficient, a message "Not enough data" will appear.*

## 5. Smart Insights (Web Reports)

**Goal:** Verify "Zombie Debt" and "Dead Stock" detection.

1.  **Navigate to Reports:**
    *   Go to "Reports" in the sidebar.
    *   The "Smart Insights" tab is selected by default.
2.  **Check High Risk Collections:**
    *   Look for the "High Risk Collections" card.
    *   If you have stores with outstanding balance > 0 who haven't paid in 45 days, they should be listed here.
3.  **Check Dead Stock:**
    *   Look for "Slow Moving Inventory".
    *   Products with Stock > 0 but no sales in 30 days should be listed.

## 6. Offline Queue Verification (Mobile)

**Goal:** Verify sales queue when offline.

1.  **Go Offline:**
    *   Turn off Wi-Fi/Data on the mobile device (or set Network to Offline in Chrome DevTools).
2.  **Record Sale:**
    *   Record a sale as an agent.
    *   Click "Record Sale".
    *   Toast should say: *"Offline — sale queued"*.
3.  **Go Online:**
    *   Restore internet connection.
    *   Wait ~10-30 seconds.
    *   Toast should appear: *"Back online. Syncing..."* followed by success messages.
    *   Verify the sale appears in "Transactions" or "History".

