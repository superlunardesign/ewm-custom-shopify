#!/usr/bin/env node

/**
 * Audit imported orders: compare CSV customer data against what Shopify has.
 * Flags any order where the name or email doesn't match.
 *
 * Usage:
 *   node audit-customers.js <path-to-squarespace-csv>
 */

import { readFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) { console.error("Missing .env"); process.exit(1); }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

loadEnv();

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2024-10";
const BASE_URL = `https://${STORE}/admin/api/${API_VERSION}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findCol(row, ...candidates) {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const lower = c.toLowerCase();
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === lower) return row[key];
      if (key.toLowerCase().replace(/[\s_-]+/g, "") === lower.replace(/[\s_-]+/g, "")) return row[key];
    }
  }
  return "";
}

// Parse the CSV and get expected customer per order
function parseCSV(path) {
  const raw = readFileSync(path, "utf8");
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });

  const orders = new Map();
  for (const row of records) {
    const id = findCol(row, "ID", "Order ID", "Order Number", "orderNumber", "Order No");
    if (!id) continue;
    const cancelledAt = findCol(row, "Cancelled at", "Cancelled At", "Canceled at");
    if (cancelledAt) continue;

    if (!orders.has(id)) {
      orders.set(id, {
        orderId: id,
        customerName: findCol(row, "Customer Name", "Name", "Billing Name"),
        email: findCol(row, "Customer Email", "Email", "Billing Email"),
        shippingName: findCol(row, "Shipping Name"),
        billingAddr1: findCol(row, "Billing Address Line 1", "Billing Address1"),
        shippingAddr1: findCol(row, "Shipping Address Line 1", "Shipping Address1"),
      });
    }
  }
  return orders;
}

// Fetch all imported orders from Shopify
async function fetchImportedOrders() {
  const allOrders = [];
  let url = "/orders.json?limit=250&status=any&tag=imported";
  while (url) {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: { "X-Shopify-Access-Token": TOKEN },
    });
    if (res.status === 429) { await wait(2000); continue; }
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const data = await res.json();
    allOrders.push(...data.orders);
    const link = res.headers.get("link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1].replace(BASE_URL, "") : null;
    await wait(500);
  }
  return allOrders;
}

function norm(s) { return (s || "").trim().toLowerCase(); }

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node audit-customers.js <path-to-squarespace-csv>");
    process.exit(1);
  }

  console.log("Parsing CSV...");
  const csvOrders = parseCSV(csvPath);
  console.log(`  ${csvOrders.size} orders in CSV\n`);

  console.log("Fetching imported orders from Shopify...");
  const shopifyOrders = await fetchImportedOrders();
  console.log(`  ${shopifyOrders.length} imported orders in Shopify\n`);

  // Map Shopify orders by their SQ- ID
  const shopifyBySquareId = new Map();
  for (const order of shopifyOrders) {
    const match = order.name?.match(/#SQ-(\d+)/);
    if (match) shopifyBySquareId.set(match[1], order);
  }

  const mismatches = [];
  const correct = [];
  const notFound = [];

  for (const [sqId, csv] of csvOrders) {
    const shopify = shopifyBySquareId.get(sqId);
    if (!shopify) {
      notFound.push(csv);
      continue;
    }

    const shopifyName = [shopify.customer?.first_name, shopify.customer?.last_name]
      .filter(Boolean).join(" ");
    const shopifyEmail = shopify.customer?.email || shopify.email || "";
    const shopifyShipName = [shopify.shipping_address?.first_name, shopify.shipping_address?.last_name]
      .filter(Boolean).join(" ");
    const shopifyBillName = [shopify.billing_address?.first_name, shopify.billing_address?.last_name]
      .filter(Boolean).join(" ");

    const nameMatch = norm(csv.customerName) === norm(shopifyName) ||
                      norm(csv.customerName) === norm(shopifyBillName);
    const emailMatch = norm(csv.email) === norm(shopifyEmail);

    if (nameMatch && emailMatch) {
      correct.push({ sqId, csv, shopifyName, shopifyEmail });
    } else {
      mismatches.push({
        sqId,
        shopifyOrderName: shopify.name,
        shopifyOrderId: shopify.id,
        csvName: csv.customerName,
        csvEmail: csv.email,
        shopifyName,
        shopifyEmail,
        shopifyBillName,
        shopifyShipName,
        nameMatch,
        emailMatch,
      });
    }
  }

  // Report
  console.log("═".repeat(70));
  console.log(`CORRECT (${correct.length})`);
  console.log("═".repeat(70));
  for (const c of correct) {
    console.log(`  ✓ SQ-${c.sqId} | ${c.csv.customerName} | ${c.csv.email}`);
  }

  if (mismatches.length) {
    console.log();
    console.log("═".repeat(70));
    console.log(`MISMATCHES (${mismatches.length})`);
    console.log("═".repeat(70));
    for (const m of mismatches) {
      console.log(`  ✗ ${m.shopifyOrderName} (SQ-${m.sqId})`);
      if (!m.nameMatch) {
        console.log(`    NAME  CSV: "${m.csvName}"  →  Shopify: "${m.shopifyName}"`);
        if (m.shopifyBillName && m.shopifyBillName !== m.shopifyName) {
          console.log(`    BILLING NAME: "${m.shopifyBillName}"`);
        }
      }
      if (!m.emailMatch) {
        console.log(`    EMAIL CSV: "${m.csvEmail}"  →  Shopify: "${m.shopifyEmail}"`);
      }
      console.log(`    Shopify order ID: ${m.shopifyOrderId}`);
    }
  }

  if (notFound.length) {
    console.log();
    console.log("═".repeat(70));
    console.log(`NOT FOUND IN SHOPIFY (${notFound.length})`);
    console.log("═".repeat(70));
    for (const n of notFound) {
      console.log(`  ? SQ-${n.orderId} | ${n.customerName} | ${n.email}`);
    }
  }

  console.log();
  console.log("--- SUMMARY ---");
  console.log(`  Correct:     ${correct.length}`);
  console.log(`  Mismatched:  ${mismatches.length}`);
  console.log(`  Not found:   ${notFound.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
