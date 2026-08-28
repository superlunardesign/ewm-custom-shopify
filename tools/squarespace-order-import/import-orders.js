#!/usr/bin/env node

/**
 * Order history import with product linking.
 *
 * Usage:
 *   1. Save your order export CSV to this folder as orders.csv
 *   2. Create a .env with your Shopify credentials (see .env.example)
 *   3. npm install
 *   4. node delete-orders.js          (delete existing orders first)
 *   5. node import-orders.js --dry-run (preview)
 *   6. node import-orders.js           (import for real)
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

// ── Product name mapping ───────────────────────────────────────────
// Maps old CSV product names → Shopify product handles.
// Products not in this map will import as custom (unlinked) line items.
const PRODUCT_NAME_TO_HANDLE = {
  "Tizo TIZO3 Facial Primer Tinted": "tizo-primer-sunscreen-tinted",
  "TIZO3 Facial Primer Tinted": "tizo-primer-sunscreen-tinted",
  "8% L-MANDELIC SERUM": "spring-bowl-rltkk-dnchc",
  "HydraBalance | Face Reality": "hydrabalance",
  "FACE REALITY HYDRABALANCE": "hydrabalance",
  "HYDRABALANCE": "hydrabalance",
  "Barrier Care Gel Cream": "barrier-care-gel-cream",
  "hydraRemedy Gel Serum": "hydraremedy-gel-serum",
  "Hale & Hush QUIET WASH CLEANSER": "quiet-wash",
  "QUIET WASH": "quiet-wash",
  "Skin Script Clarifying Toner Pads": "clarifying-toner-pads",
  "Ultra Zinc Body & Face Tinted": "ultrazincbodyandfacetinted",
  "Skin Script Light Aloe Moisturizer": "lightaloemoisturizer",
  "Light Aloe Moisturizer": "lightaloemoisturizer",
  "Soothing Radiance Toner | Face Reality": "soothing-radiance-toner",
  "Hush Hydrate Gel | Hale & Hush": "hush-hydrate-gel-hale-hush",
  "Hale & Hush HUSH HYDRATE GEL": "hush-hydrate-gel-hale-hush",
  "HUSH HYDRATE GEL": "hush-hydrate-gel-hale-hush",
  "Antioxidant Peptide Eye Gel | Face Reality": "antioxidant-peptide-eye-gel-face-reality",
  "FACE REALITY ANTIOXIDANT PEPTIDE EYE GEL": "antioxidant-peptide-eye-gel-face-reality",
  "ANTIOXIDANT PEPTIDE EYE GEL": "antioxidant-peptide-eye-gel-face-reality",
  "Raspberry Refining Scrub | Skin Script": "raspberry-refining-scrub-skin-script",
  "Skin Script Raspberry Refining Scrub": "raspberry-refining-scrub-skin-script",
  "Barrier Balance Creamy Cleanser | Face Reality": "face-reality-barrier-balance-creamy-cleanser",
  "FACE REALITY Barrier Balance Creamy Cleanser": "face-reality-barrier-balance-creamy-cleanser",
  "Barrier Balance Creamy Cleanser": "face-reality-barrier-balance-creamy-cleanser",
  "Beta-Glucan Serum": "beta-serum",
  "Mixi Peptide Rescue Cream": "mixi-peptide-rescue-cream",
  "15% L-Mandelic Serum | Face Reality": "15-mandelic-serum-face-reality",
  "Tizo TIZO2 Facial Primer Non-Tinted": "tizo-primer-sunscreen-non-tinted",
  "TIZO2 Facial Primer Non-Tinted": "tizo-primer-sunscreen-non-tinted",
  "Antioxidant Scrub | Face Reality": "antioxidant-scrub-face-reality",
  "Hale & Hush RELIEF BIO-POWDER": "relief-bio-powder",
  "RELIEF BIO-POWDER": "relief-bio-powder",
  "Skin Script Acai Berry Moisturizer": "acai-berry-moisturizer",
  "Acai Berry Moisturizer": "acai-berry-moisturizer",
  "Skin Script Pomegranate Antioxidant Cleanser": "pomegranate-antioxidant-cleanser",
  "Pomegranate Antioxidant Cleanser": "pomegranate-antioxidant-cleanser",
  "Skin Script Ageless Hydrating Serum": "ageless-hydrating-serum",
  "Ageless Hydrating Serum": "ageless-hydrating-serum",
  "DAILY SPF 30 PLUS | FACE REALITY": "daily-spf-30-lotion",
  "FACE REALITY DAILY SPF 30 PLUS": "daily-spf-30-lotion",
  "FACE REALITY DAILY SPF 30 LOTION": "daily-spf-30-lotion",
  "DAILY SPF 30 LOTION": "daily-spf-30-lotion",
  "Hydroxi Acne Cream": "hydroxi-acne-cream",
  "FACE REALITY CRAN-PEPTIDE CREAM": "cran-peptide-cream",
  "CRAN-PEPTIDE CREAM": "cran-peptide-cream",
  "2x2 Dental Gauze For Toner": "2x2-dental-gauze-pads-for-toner",
  "FACE REALITY MINERAL MATTE SPF 28": "ultimate-protection-spf-28",
  "MINERAL MATTE SPF 28": "ultimate-protection-spf-28",
  "ULTIMATE PROTECTION SPF 28": "ultimate-protection-spf-28",
  "5% L-MANDELIC SERUM": "golden-mist-cup-weny8-srrdt",
  "FACE REALITY ANTIOXIDANT PEPTIDE FACE SERUM": "antioxidant-peptide-face-serum",
  "ANTIOXIDANT PEPTIDE FACE SERUM": "antioxidant-peptide-face-serum",
  "Skin Script Peptide Eye Serum": "peptide-eye-serum",
  "Peptide Eye Serum": "peptide-eye-serum",
  "Hale & Hush Remedy Rehab Oil": "remedy-rehab-oil",
  "Remedy Rehab Oil": "remedy-rehab-oil",
  "Premium Compressed Face Cleansing Towels | Mixi": "mixi-premium-compressed-towels",
  "FACE REALITY SALICYLIC+ SERUM": "salicylic-serum",
  "SALICYLIC+ SERUM": "salicylic-serum",
  "SALICYLIC SERUM": "salicylic-serum",
  "Sport SPF 50 Continuous Spray Sunscreen 6 oz | SolRX": "sport-spf-50-continuous-spray-solrx",
  "Sport SPF 50 Lotion | Sol RX": "sport-spf-50-lotion-solrx",
  "Skin Script Tri-Peptide Eye Cream": "tri-peptide-eye-cream",
  "Refine Polish | Hale & Hush": "refine-polish-exfoliant-hale-hush",
  "Hale & Hush REFINE POLISH": "refine-polish-exfoliant-hale-hush",
  "REFINE POLISH": "refine-polish-exfoliant-hale-hush",
  "Skin Script Citrus-C Nourishing Cream": "citrus-c-nourishing-cream",
  "Hale & Hush BRILLIANT EYE & LIP SERUM": "hale-hush-brilliant-eye-lip-serum",
  "BRILLIANT EYE & LIP SERUM": "hale-hush-brilliant-eye-lip-serum",
  "Botanical Bloom Hydrating Mask": "botanical-bloom-hydrating-mask",
  "Michele Corley Pore Clearing Cleansing Oil": "michele-corley-pore-clearing-cleansing-oil",
  "Skin Script Retinol 2% Exfoliating Scrub/Mask": "retinol-2-exfoliating-scrub-mask",
  "Retinol 2% Exfoliating Scrub/Mask": "retinol-2-exfoliating-scrub-mask",
  "11% L-MANDELIC SERUM": "11-l-mandelic-serum",
  "Skin Script Glycolic and Retinol Pads": "glycolicandreinolpads",
  "Glycolic and Retinol Pads": "glycolicandreinolpads",
  "Agent 88 - Ingrown Hair & Body Acne Serum": "agent-88-ingrown-hair-body-acne-serum",
  "CLEARDERMA MOISTURIZER | FACE REALITY": "clearderma-moisturizer",
  "FACE REALITY CLEARDERMA MOISTURIZER": "clearderma-moisturizer",
  "CLEARDERMA MOISTURIZER": "clearderma-moisturizer",
  "FACE REALITY CALMING FACIAL TONER": "calming-facial-toner",
  "Tizo Ultra Zinc Body & Face Non-Tinted": "ultra-zinc-body-face-non-tinted",
  "Ultra Zinc Body & Face Non-Tinted": "ultra-zinc-body-face-non-tinted",
  "Mixi Mist Hypochlorous Acid Spray": "mixi-mist",
  "Biogel | AnteAGE": "anteage-biogel",
  "FACE REALITY ACNE-SAFE KIT FOR NORMAL OR COMBINATION SKIN": "acne-safe-kit-normal-combination-skin",
  "ACNE-SAFE KIT FOR NORMAL OR COMBINATION SKIN": "acne-safe-kit-normal-combination-skin",
  "GlowTone™ Corrective Serum | Face Reality": "glowtone-corrective-serum",
  "Face Reality | glowTone™ Corrective Serum": "glowtone-corrective-serum",
  "GREEN ENVEE | RELAX HAND + BODY LOTION": "relax-hand-body-lotion",
  "L-Mandelic Face & Body Wash | Face Reality": "v5xfxmdwvahg1dyaeqqxvu5eke0550",
  "FACE REALITY L-Mandelic Face And Body Wash": "v5xfxmdwvahg1dyaeqqxvu5eke0550",
  "L-Mandelic Face And Body Wash": "v5xfxmdwvahg1dyaeqqxvu5eke0550",
  "FACE REALITY HYDRACALM MASK": "hydracalm-mask",
  "HYDRACALM MASK": "hydracalm-mask",
  "Hale & Hush Duo Hush Hydrate Gel & Relief Bio Powder": "haleandhushduo",
  "Brighten-C Mask | Acne-Safe Brightening Mask by Face Reality": "brighten-c-mask-face-reality",
  "BRIGHTEN-C MASK": "brighten-c-mask-face-reality",
  "Hale & Hush Broad Spectrum SPF 30": "broad-spectrum-spf30",
  "Broad Spectrum SPF 30": "broad-spectrum-spf30",
  "FACE REALITY SULFUR SPOT TREATMENT": "sulfur-spot-treatment",
  "SULFUR SPOT TREATMENT": "sulfur-spot-treatment",
  "Saint Tropez | Tuff Peach Craft Co": "saint-tropez",
  "GREEN ENVEE | ZEN HAND + BODY LOTION": "zen-hand-body-lotion",
  "GREEN ENVEE | STRESS REMEDY HAND + BODY LOTION": "stress-remedy-hand-body-lotion",
  "BALANCE HAND + BODY LOTION": "balance-hand-body-lotion",
  "Skin Script Cucumber Hydration Toner": "cucumber-hydration-toner",
  "Cucumber Hydration Toner": "cucumber-hydration-toner",
  "Mixi 5% Mandelic Serum": "5-mandelic-serum",
  "Mixi Clear Plex 5%": "clear-plex-5",
  "Mixi 8% Mandelic Serum": "8-mandelic-serum",
  "8% Mandelic Serum": "8-mandelic-serum",
  "Mixi Clear Plex 10%": "clear-plex-10",
  "Mixi Clear Plex 2.8%": "clear-plex-2-8",
  "Hale & Hush Charcoal Clarifying Mask 3oz.": "charcoal-clarifying-mask",
  "BUSHBALM Mini Exfoliating Mitt": "miniexfoliatingmitt",
  "Mini Exfoliating Mitt": "miniexfoliatingmitt",
  "SAL-C TONER": "sal-c-toner-face-reality",
  "Sal-C Toner | Face Reality": "sal-c-toner-face-reality",
  "L-MANDELIC FACE AND BODY SCRUB": "face-reality-l-mandelic-face-body-scrub",
  "Steel Eye Rollers": "steel-eye-roller",
  "Gift Card": "gift-card-for-facial-spa-in-mchenry-il-esthetics-with-me",
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

// ── Fetch all Shopify products to build handle → variant_id map ───
async function fetchProductVariantMap() {
  console.log("Fetching Shopify products for variant linking...");
  const handleToVariant = new Map();
  let url = "/products.json?limit=250&fields=id,handle,variants";

  while (url) {
    const fullUrl = `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": TOKEN,
      },
    });

    if (res.status === 429) {
      const retryAfter = parseFloat(res.headers.get("Retry-After") || "2");
      await wait(retryAfter * 1000);
      continue;
    }

    const body = await res.json();
    if (body.products) {
      for (const product of body.products) {
        if (product.variants && product.variants.length > 0) {
          handleToVariant.set(product.handle, {
            productId: product.id,
            variantId: product.variants[0].id,
          });
        }
      }
    }

    const linkHeader = res.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        const nextUrl = new URL(match[1]);
        url = nextUrl.pathname.replace(`/admin/api/${API_VERSION}`, "") + nextUrl.search;
      } else {
        url = null;
      }
    } else {
      url = null;
    }

    await wait(550);
  }

  console.log(`  Found ${handleToVariant.size} products with variants\n`);
  return handleToVariant;
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

// ── Column mapping ──────────────────────────────────────────────────
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
    dateFulfilled: findCol(row, "Date Fulfilled", "Fulfilled At", "Fulfilled at"),
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
    fulfillmentStatus: findCol(row, "Fulfillment Status", "Fulfilled"),
    paymentStatus: findCol(row, "Payment Status", "Financial Status"),
    note: findCol(row, "Note", "Notes", "Customer Note", "Private Notes"),
    currency: findCol(row, "Currency"),
  };
}

// ── Group rows by order ─────────────────────────────────────────────
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

function buildShopifyOrder(order, handleToVariant) {
  const { first, last } = splitName(order.customerName);
  const processedAt = order.date ? new Date(order.date).toISOString() : undefined;

  let linked = 0;
  let unlinked = 0;

  const lineItems = order.lineItems.map((item) => {
    const handle = PRODUCT_NAME_TO_HANDLE[item.name];
    const variant = handle ? handleToVariant.get(handle) : null;

    if (variant) {
      linked++;
      return {
        variant_id: variant.variantId,
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
  console.log(`CSV: ${CSV_FILE}\n`);

  const handleToVariant = await fetchProductVariantMap();

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
    const { payload, linked, unlinked } = buildShopifyOrder(order, handleToVariant);
    totalLinked += linked;
    totalUnlinked += unlinked;

    if (DRY_RUN) {
      console.log(
        `  [DRY RUN] Order ${id} | ${email} | ${items} items (${linked} linked, ${unlinked} custom) | $${cleanPrice(total)}`
      );
      for (const item of order.lineItems) {
        const handle = PRODUCT_NAME_TO_HANDLE[item.name];
        const variant = handle ? handleToVariant.get(handle) : null;
        const tag = variant ? "✓" : "✗";
        console.log(`    ${tag} ${item.name} x${item.quantity} @ $${item.price}`);
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
  console.log(`Line items as custom (unlinked): ${totalUnlinked}`);
  console.log(`Log saved: ${logPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
