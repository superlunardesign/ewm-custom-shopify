#!/usr/bin/env node

/**
 * One-time Squarespace → Shopify order import.
 *
 * Usage:
 *   1. Export orders from Squarespace (Commerce > Orders > Export)
 *   2. Save the CSV to this folder
 *   3. Create a .env file with your Shopify credentials (see below)
 *   4. npm install
 *   5. npm run dry-run     (preview what will be created)
 *   6. npm run import      (actually create the orders)
 *
 * .env format:
 *   SHOPIFY_STORE=ke18jq-r4.myshopify.com
 *   SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   CSV_FILE=orders.csv
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) {
    console.error("Missing .env file. Create one with:");
    console.error("  SHOPIFY_STORE=your-store.myshopify.com");
    console.error("  SHOPIFY_ACCESS_TOKEN=shpat_...");
    console.error("  CSV_FILE=orders.csv");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
}

loadEnv();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const CSV_FILE = resolve(__dirname, process.env.CSV_FILE || "orders.csv");
const DRY_RUN = process.argv.includes("--dry-run");
const API_VERSION = "2024-10";
const BASE_URL = `https://${STORE}/admin/api/${API_VERSION}`;

if (!STORE || !TOKEN) {
  console.error("SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN are required in .env");
  process.exit(1);
}

// ── Rate limiter (2 req/sec for Shopify REST) ───────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shopifyFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
      ...options.headers,
    },
  });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("Retry-After") || "2");
    console.log(`  Rate limited, waiting ${retryAfter}s...`);
    await wait(retryAfter * 1000);
    return shopifyFetch(endpoint, options);
  }

  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Shopify API ${res.status}: ${JSON.stringify(body.errors || body)}`
    );
  }

  await wait(550);
  return body;
}

// ── CSV parsing ─────────────────────────────────────────────────────
function readOrders() {
  if (!existsSync(CSV_FILE)) {
    console.error(`CSV file not found: ${CSV_FILE}`);
    console.error("Export your orders from Squarespace and save the CSV here.");
    process.exit(1);
  }

  const raw = readFileSync(CSV_FILE, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  console.log(`Read ${records.length} rows from CSV`);
  return records;
}

// ── Column mapping ──────────────────────────────────────────────────
// Squarespace CSV columns vary slightly by export version.
// This maps common column names to our internal keys.
function findCol(row, ...candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const lower = c.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return row[key];
      if (key.toLowerCase().replace(/[\s_-]+/g, "") === lower.replace(/[\s_-]+/g, ""))
        return row[key];
    }
  }
  return "";
}

function parseRow(row) {
  return {
    orderId: findCol(row, "Order ID", "Order Number", "orderNumber", "Order No"),
    date: findCol(row, "Date Created", "Order Date", "Date", "Created On"),
    dateFulfilled: findCol(row, "Date Fulfilled", "Fulfilled At"),
    email: findCol(row, "Customer Email", "Email", "Billing Email"),
    customerName: findCol(row, "Customer Name", "Name", "Billing Name"),
    billingAddr1: findCol(row, "Billing Address Line 1", "Billing Address1", "Billing Street"),
    billingAddr2: findCol(row, "Billing Address Line 2", "Billing Address2"),
    billingCity: findCol(row, "Billing City"),
    billingState: findCol(row, "Billing State", "Billing Province"),
    billingZip: findCol(row, "Billing Zip", "Billing Postal Code"),
    billingCountry: findCol(row, "Billing Country"),
    billingPhone: findCol(row, "Billing Phone"),
    shippingName: findCol(row, "Shipping Name"),
    shippingAddr1: findCol(row, "Shipping Address Line 1", "Shipping Address1", "Shipping Street"),
    shippingAddr2: findCol(row, "Shipping Address Line 2", "Shipping Address2"),
    shippingCity: findCol(row, "Shipping City"),
    shippingState: findCol(row, "Shipping State", "Shipping Province"),
    shippingZip: findCol(row, "Shipping Zip", "Shipping Postal Code"),
    shippingCountry: findCol(row, "Shipping Country"),
    shippingPhone: findCol(row, "Shipping Phone"),
    itemName: findCol(row, "Line Item Name", "Lineitem name", "Product Name", "Item"),
    itemSku: findCol(row, "Line Item SKU", "Lineitem sku", "SKU"),
    itemQty: findCol(row, "Line Item Quantity", "Lineitem quantity", "Quantity"),
    itemPrice: findCol(row, "Line Item Unit Price", "Lineitem price", "Unit Price"),
    itemTotal: findCol(row, "Line Item Total"),
    subtotal: findCol(row, "Subtotal"),
    tax: findCol(row, "Tax", "Taxes"),
    shipping: findCol(row, "Shipping", "Shipping Total"),
    discount: findCol(row, "Discount", "Discount Amount"),
    total: findCol(row, "Grand Total", "Total"),
    fulfillmentStatus: findCol(row, "Fulfillment Status", "Fulfilled"),
    paymentStatus: findCol(row, "Payment Status", "Financial Status"),
    note: findCol(row, "Note", "Notes", "Customer Note"),
    currency: findCol(row, "Currency"),
  };
}

// ── Group rows by order ─────────────────────────────────────────────
// Multi-item orders have one CSV row per line item
function groupByOrder(records) {
  const orders = new Map();
  for (const record of records) {
    const row = parseRow(record);
    const id = row.orderId;
    if (!id) continue;

    if (!orders.has(id)) {
      orders.set(id, { ...row, lineItems: [] });
    }
    const order = orders.get(id);

    if (row.itemName) {
      order.lineItems.push({
        name: row.itemName,
        sku: row.itemSku,
        quantity: parseInt(row.itemQty, 10) || 1,
        price: cleanPrice(row.itemPrice || row.itemTotal),
      });
    }
  }
  return orders;
}

function cleanPrice(val) {
  if (!val) return "0.00";
  return val.toString().replace(/[^0-9.-]/g, "") || "0.00";
}

// ── Build Shopify order payload ─────────────────────────────────────
function splitName(full) {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function mapFinancialStatus(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("paid") || s.includes("completed")) return "paid";
  if (s.includes("refund")) return "refunded";
  if (s.includes("partial")) return "partially_refunded";
  if (s.includes("pending")) return "pending";
  return "paid";
}

function mapFulfillmentStatus(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("fulfilled") || s.includes("shipped") || s.includes("completed"))
    return "fulfilled";
  if (s.includes("partial")) return "partial";
  return null;
}

function buildAddress(order, prefix) {
  const name =
    prefix === "shipping"
      ? order.shippingName || order.customerName
      : order.customerName;
  const { first, last } = splitName(name);
  const addr1 = prefix === "shipping" ? order.shippingAddr1 : order.billingAddr1;
  const addr2 = prefix === "shipping" ? order.shippingAddr2 : order.billingAddr2;
  const city = prefix === "shipping" ? order.shippingCity : order.billingCity;
  const state = prefix === "shipping" ? order.shippingState : order.billingState;
  const zip = prefix === "shipping" ? order.shippingZip : order.billingZip;
  const country = prefix === "shipping" ? order.shippingCountry : order.billingCountry;
  const phone = prefix === "shipping" ? order.shippingPhone : order.billingPhone;

  if (!addr1 && !city) return undefined;

  return {
    first_name: first,
    last_name: last,
    address1: addr1 || "",
    address2: addr2 || "",
    city: city || "",
    province: state || "",
    zip: zip || "",
    country: country || "US",
    phone: phone || "",
  };
}

function buildShopifyOrder(order) {
  const { first, last } = splitName(order.customerName);
  const processedAt = order.date ? new Date(order.date).toISOString() : undefined;

  const lineItems = order.lineItems.map((item) => ({
    title: item.name,
    sku: item.sku || undefined,
    quantity: item.quantity,
    price: item.price,
    requires_shipping: true,
  }));

  if (lineItems.length === 0) {
    lineItems.push({
      title: "Squarespace order (details unavailable)",
      quantity: 1,
      price: cleanPrice(order.total || order.subtotal),
    });
  }

  const shippingCost = cleanPrice(order.shipping);
  const shippingLines =
    parseFloat(shippingCost) > 0
      ? [{ title: "Shipping", price: shippingCost }]
      : [];

  const payload = {
    order: {
      name: `#SQ-${order.orderId}`,
      processed_at: processedAt,
      financial_status: mapFinancialStatus(order.paymentStatus),
      fulfillment_status: mapFulfillmentStatus(order.fulfillmentStatus),
      currency: order.currency || "USD",
      send_receipt: false,
      send_fulfillment_receipt: false,
      inventory_behaviour: "bypass",
      tags: "imported, squarespace",
      note: `Imported from Squarespace order ${order.orderId}${order.note ? ". " + order.note : ""}`,
      customer: {
        first_name: first,
        last_name: last,
        email: order.email || undefined,
      },
      line_items: lineItems,
      shipping_lines: shippingLines,
      total_tax: cleanPrice(order.tax),
      billing_address: buildAddress(order, "billing"),
      shipping_address: buildAddress(order, "shipping"),
    },
  };

  const discount = parseFloat(cleanPrice(order.discount));
  if (discount > 0) {
    payload.order.discount_codes = [
      {
        code: "SQUARESPACE-IMPORT",
        amount: discount.toFixed(2),
        type: "fixed_amount",
      },
    ];
  }

  return payload;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== IMPORTING ORDERS ===");
  console.log(`Store: ${STORE}`);
  console.log(`CSV: ${CSV_FILE}\n`);

  const records = readOrders();
  const orders = groupByOrder(records);
  console.log(`Found ${orders.size} unique orders\n`);

  const results = { created: [], skipped: [], errors: [] };

  for (const [id, order] of orders) {
    const email = order.email || "(no email)";
    const total = order.total || order.subtotal || "?";
    const items = order.lineItems.length;

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Order ${id} | ${email} | ${items} items | $${cleanPrice(total)}`
      );
      for (const item of order.lineItems) {
        console.log(`    - ${item.name} x${item.quantity} @ $${item.price}`);
      }
      results.created.push(id);
      continue;
    }

    try {
      const payload = buildShopifyOrder(order);
      const res = await shopifyFetch("/orders.json", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const shopifyId = res.order?.id;
      console.log(
        `  Created order ${id} → Shopify #${shopifyId} | ${email} | ${items} items | $${cleanPrice(total)}`
      );
      results.created.push({ sqId: id, shopifyId, email });
    } catch (err) {
      console.error(`  FAILED order ${id}: ${err.message}`);
      results.errors.push({ sqId: id, email, error: err.message });
    }
  }

  // Write results log
  const logPath = resolve(__dirname, `import-log-${Date.now()}.json`);
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n--- Results ---`);
  console.log(`Created: ${results.created.length}`);
  console.log(`Errors: ${results.errors.length}`);
  console.log(`Log saved: ${logPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
