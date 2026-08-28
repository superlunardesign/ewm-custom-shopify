#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) {
    console.error("Missing .env file.");
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

// ── Direct variant ID mapping ──────────────────────────────────────
// Maps old CSV product names → Shopify variant IDs (no runtime lookup needed)
const NAME_TO_VARIANT = {
  "Tizo TIZO3 Facial Primer Tinted": 46470967066836,
  "TIZO3 Facial Primer Tinted": 46470967066836,
  "8% L-MANDELIC SERUM": 46470966804692,
  "HydraBalance | Face Reality": 46470965199060,
  "FACE REALITY HYDRABALANCE": 46470965199060,
  "HYDRABALANCE": 46470965199060,
  "Barrier Care Gel Cream": 47559291470036,
  "hydraRemedy Gel Serum": 46461759193300,
  "Hale & Hush QUIET WASH CLEANSER": 46470966083796,
  "QUIET WASH": 46470966083796,
  "Skin Script Clarifying Toner Pads": 46470963527892,
  "Ultra Zinc Body & Face Tinted": 46470967230676,
  "Skin Script Light Aloe Moisturizer": 46470965297364,
  "Light Aloe Moisturizer": 46470965297364,
  "Soothing Radiance Toner | Face Reality": 47559291437268,
  "Hush Hydrate Gel | Hale & Hush": 47559291863252,
  "Hale & Hush HUSH HYDRATE GEL": 47559291863252,
  "HUSH HYDRATE GEL": 47559291863252,
  "Antioxidant Peptide Eye Gel | Face Reality": 46461757915348,
  "FACE REALITY ANTIOXIDANT PEPTIDE EYE GEL": 46461757915348,
  "ANTIOXIDANT PEPTIDE EYE GEL": 46461757915348,
  "Raspberry Refining Scrub | Skin Script": 46470966247636,
  "Skin Script Raspberry Refining Scrub": 46470966247636,
  "Barrier Balance Creamy Cleanser | Face Reality": 46461758144724,
  "FACE REALITY Barrier Balance Creamy Cleanser": 46461758144724,
  "Barrier Balance Creamy Cleanser": 46461758144724,
  "Beta-Glucan Serum": 47559291535572,
  "Mixi Peptide Rescue Cream": 47559291699412,
  "15% L-Mandelic Serum | Face Reality": 46470963003604,
  "Tizo TIZO2 Facial Primer Non-Tinted": 46470967001300,
  "TIZO2 Facial Primer Non-Tinted": 46470967001300,
  "Antioxidant Scrub | Face Reality": 46461758079188,
  "Hale & Hush RELIEF BIO-POWDER": 46470966345940,
  "RELIEF BIO-POWDER": 46470966345940,
  "Skin Script Acai Berry Moisturizer": 46470963036372,
  "Acai Berry Moisturizer": 46470963036372,
  "Skin Script Pomegranate Antioxidant Cleanser": 46470966018260,
  "Pomegranate Antioxidant Cleanser": 46470966018260,
  "Skin Script Ageless Hydrating Serum": 46470963134676,
  "Ageless Hydrating Serum": 46470963134676,
  "DAILY SPF 30 PLUS | FACE REALITY": 46470964969684,
  "FACE REALITY DAILY SPF 30 PLUS": 46470964969684,
  "FACE REALITY DAILY SPF 30 LOTION": 46470964969684,
  "DAILY SPF 30 LOTION": 46470964969684,
  "Hydroxi Acne Cream": 46461759226068,
  "FACE REALITY CRAN-PEPTIDE CREAM": 46470964871380,
  "CRAN-PEPTIDE CREAM": 46470964871380,
  "2x2 Dental Gauze For Toner": 47559291601108,
  "FACE REALITY MINERAL MATTE SPF 28": 46470967165140,
  "MINERAL MATTE SPF 28": 46470967165140,
  "ULTIMATE PROTECTION SPF 28": 46470967165140,
  "5% L-MANDELIC SERUM": 46470965133524,
  "FACE REALITY ANTIOXIDANT PEPTIDE FACE SERUM": 46470963167444,
  "ANTIOXIDANT PEPTIDE FACE SERUM": 46470963167444,
  "Skin Script Peptide Eye Serum": 46470965952724,
  "Peptide Eye Serum": 46470965952724,
  "Hale & Hush Remedy Rehab Oil": 46470966378708,
  "Remedy Rehab Oil": 46470966378708,
  "Premium Compressed Face Cleansing Towels | Mixi": 48373049163988,
  "FACE REALITY SALICYLIC+ SERUM": 46470966640852,
  "SALICYLIC+ SERUM": 46470966640852,
  "SALICYLIC SERUM": 46470966640852,
  "Sport SPF 50 Continuous Spray Sunscreen 6 oz | SolRX": 48373049000148,
  "Sport SPF 50 Lotion | Sol RX": 48373048967380,
  "Skin Script Tri-Peptide Eye Cream": 47559291797716,
  "Refine Polish | Hale & Hush": 46470966280404,
  "Hale & Hush REFINE POLISH": 46470966280404,
  "REFINE POLISH": 46470966280404,
  "Skin Script Citrus-C Nourishing Cream": 46470963495124,
  "Hale & Hush BRILLIANT EYE & LIP SERUM": 46461758243028,
  "BRILLIANT EYE & LIP SERUM": 46461758243028,
  "Botanical Bloom Hydrating Mask": 47533813498068,
  "Michele Corley Pore Clearing Cleansing Oil": 46470965493972,
  "Skin Script Retinol 2% Exfoliating Scrub/Mask": 46470966411476,
  "Retinol 2% Exfoliating Scrub/Mask": 46470966411476,
  "11% L-MANDELIC SERUM": 46461758800084,
  "Skin Script Glycolic and Retinol Pads": 46470965100756,
  "Glycolic and Retinol Pads": 46470965100756,
  "Agent 88 - Ingrown Hair & Body Acne Serum": 46461757849812,
  "CLEARDERMA MOISTURIZER | FACE REALITY": 46470964248788,
  "FACE REALITY CLEARDERMA MOISTURIZER": 46470964248788,
  "CLEARDERMA MOISTURIZER": 46470964248788,
  "FACE REALITY CALMING FACIAL TONER": 46470963462356,
  "Tizo Ultra Zinc Body & Face Non-Tinted": 46470967197908,
  "Ultra Zinc Body & Face Non-Tinted": 46470967197908,
  "Mixi Mist Hypochlorous Acid Spray": 47559291502804,
  "Biogel | AnteAGE": 47559291568340,
  "FACE REALITY ACNE-SAFE KIT FOR NORMAL OR COMBINATION SKIN": 46470963069140,
  "ACNE-SAFE KIT FOR NORMAL OR COMBINATION SKIN": 46470963069140,
  "GlowTone™ Corrective Serum | Face Reality": 47559291764948,
  "Face Reality | glowTone™ Corrective Serum": 47559291764948,
  "GREEN ENVEE | RELAX HAND + BODY LOTION": 47559292027092,
  "L-Mandelic Face & Body Wash | Face Reality": 46470967263444,
  "FACE REALITY L-Mandelic Face And Body Wash": 46470967263444,
  "L-Mandelic Face And Body Wash": 46470967263444,
  "FACE REALITY HYDRACALM MASK": 46470965231828,
  "HYDRACALM MASK": 46470965231828,
  "Hale & Hush Duo Hush Hydrate Gel & Relief Bio Powder": 46470965166292,
  "Brighten-C Mask | Acne-Safe Brightening Mask by Face Reality": 46470963200212,
  "BRIGHTEN-C MASK": 46470963200212,
  "Hale & Hush Broad Spectrum SPF 30": 46470963265748,
  "Broad Spectrum SPF 30": 46470963265748,
  "FACE REALITY SULFUR SPOT TREATMENT": 46470966902996,
  "SULFUR SPOT TREATMENT": 46470966902996,
  "Saint Tropez | Tuff Peach Craft Co": 46470966444244,
  "GREEN ENVEE | ZEN HAND + BODY LOTION": 47559291961556,
  "GREEN ENVEE | STRESS REMEDY HAND + BODY LOTION": 47203497509076,
  "BALANCE HAND + BODY LOTION": 47559291928788,
  "Skin Script Cucumber Hydration Toner": 48474732986580,
  "Cucumber Hydration Toner": 48474732986580,
  "Mixi 5% Mandelic Serum": 48515555786964,
  "Mixi Clear Plex 5%": 48515490283732,
  "Mixi 8% Mandelic Serum": 48515471802580,
  "8% Mandelic Serum": 48515471802580,
  "Mixi Clear Plex 10%": 48515467411668,
  "Mixi Clear Plex 2.8%": 48515488219348,
  "Hale & Hush Charcoal Clarifying Mask 3oz.": 47559291830484,
  "BUSHBALM Mini Exfoliating Mitt": 46470965559508,
  "Mini Exfoliating Mitt": 46470965559508,
  "SAL-C TONER": 46476644745428,
  "Sal-C Toner | Face Reality": 46476644745428,
  "L-MANDELIC FACE AND BODY SCRUB": 46470965035220,
  "Steel Eye Rollers": 46470966837460,
};

// ── Rate limiter ───────────────────────────────────────────────────
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
    orderId: findCol(row, "ID", "Order ID", "Order Number", "orderNumber", "Order No"),
    date: findCol(row, "Date Created", "Order Date", "Date", "Created On", "Created at"),
    email: findCol(row, "Customer Email", "Email", "Billing Email"),
    customerName: findCol(row, "Customer Name", "Name", "Billing Name"),
    cancelledAt: findCol(row, "Cancelled at", "Cancelled At", "Canceled at"),
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
    discountCode: findCol(row, "Discount Code"),
    discount: findCol(row, "Discount", "Discount Amount"),
    total: findCol(row, "Grand Total", "Total"),
    paymentStatus: findCol(row, "Payment Status", "Financial Status"),
    note: findCol(row, "Note", "Notes", "Customer Note", "Private Notes"),
    currency: findCol(row, "Currency"),
  };
}

function groupByOrder(records) {
  const orders = new Map();
  for (const record of records) {
    const row = parseRow(record);
    const id = row.orderId;
    if (!id) continue;
    if (row.cancelledAt) continue;

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

  let linked = 0;
  let unlinked = 0;

  const lineItems = order.lineItems.map((item) => {
    const variantId = NAME_TO_VARIANT[item.name];

    if (variantId) {
      linked++;
      return {
        variant_id: variantId,
        quantity: item.quantity,
        price: item.price,
        requires_shipping: true,
      };
    }

    unlinked++;
    return {
      title: item.name,
      sku: item.sku || undefined,
      quantity: item.quantity,
      price: item.price,
      requires_shipping: true,
    };
  });

  if (lineItems.length === 0) {
    lineItems.push({
      title: "Order (details unavailable)",
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
      fulfillment_status: "fulfilled",
      currency: order.currency || "USD",
      send_receipt: false,
      send_fulfillment_receipt: false,
      suppress_notifications: true,
      inventory_behaviour: "bypass",
      tags: "imported, squarespace",
      note: `Imported from order ${order.orderId}${order.note ? ". " + order.note : ""}`,
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
        code: order.discountCode || "IMPORTED-DISCOUNT",
        amount: discount.toFixed(2),
        type: "fixed_amount",
      },
    ];
  }

  return { payload, linked, unlinked };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== IMPORTING ORDERS ===");
  console.log(`Store: ${STORE}`);
  console.log(`CSV: ${CSV_FILE}`);
  console.log(`Product mappings loaded: ${Object.keys(NAME_TO_VARIANT).length}\n`);

  const records = readOrders();
  const orders = groupByOrder(records);
  console.log(`Found ${orders.size} unique orders\n`);

  const results = { created: [], errors: [] };
  let totalLinked = 0;
  let totalUnlinked = 0;

  for (const [id, order] of orders) {
    const email = order.email || "(no email)";
    const total = order.total || order.subtotal || "?";
    const items = order.lineItems.length;
    const { payload, linked, unlinked } = buildShopifyOrder(order);
    totalLinked += linked;
    totalUnlinked += unlinked;

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Order ${id} | ${email} | ${items} items (${linked} linked, ${unlinked} custom) | $${cleanPrice(total)}`
      );
      for (const item of order.lineItems) {
        const vid = NAME_TO_VARIANT[item.name];
        const tag = vid ? "LINKED" : "custom";
        console.log(`    [${tag}] ${item.name} x${item.quantity} @ $${item.price}`);
      }
      results.created.push(id);
      continue;
    }

    try {
      const res = await shopifyFetch("/orders.json", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const shopifyId = res.order?.id;
      console.log(
        `  Created order ${id} → Shopify #${shopifyId} | ${email} | ${linked}/${items} linked | $${cleanPrice(total)}`
      );
      results.created.push({ sqId: id, shopifyId, email, linked, unlinked });
    } catch (err) {
      console.error(`  FAILED order ${id}: ${err.message}`);
      results.errors.push({ sqId: id, email, error: err.message });
    }
  }

  const logPath = resolve(__dirname, `import-log-${Date.now()}.json`);
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n--- Results ---`);
  console.log(`Created: ${results.created.length}`);
  console.log(`Errors: ${results.errors.length}`);
  console.log(`Line items linked to products: ${totalLinked}`);
  console.log(`Line items as custom (discontinued): ${totalUnlinked}`);
  console.log(`Log saved: ${logPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
