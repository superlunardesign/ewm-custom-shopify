#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "fs";
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
const API_VERSION = "2024-10";
const BASE_URL = `https://${STORE}/admin/api/${API_VERSION}`;
const DRY_RUN = process.argv.includes("--dry-run");

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

  if (res.status === 204 || res.status === 200) {
    const text = await res.text();
    await wait(550);
    return text ? JSON.parse(text) : {};
  }

  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Shopify API ${res.status}: ${JSON.stringify(body.errors || body)}`);
  }

  await wait(550);
  return body;
}

async function getAllOrders() {
  const allOrders = [];
  let url = "/orders.json?status=any&limit=250";

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
    if (body.orders) {
      allOrders.push(...body.orders);
      console.log(`  Fetched ${allOrders.length} orders so far...`);
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

  return allOrders;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN — DELETE ALL ORDERS ===" : "=== DELETING ALL ORDERS ===");
  console.log(`Store: ${STORE}\n`);

  console.log("Fetching all orders...");
  const orders = await getAllOrders();
  console.log(`\nFound ${orders.length} total orders\n`);

  if (orders.length === 0) {
    console.log("No orders to delete.");
    return;
  }

  let deleted = 0;
  let cancelled = 0;
  let errors = 0;

  for (const order of orders) {
    const label = `${order.name || order.id} (${order.email || "no email"})`;

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would delete: ${label}`);
      deleted++;
      continue;
    }

    try {
      // Step 1: Cancel if not already cancelled
      if (order.cancelled_at === null && order.financial_status !== "refunded" && order.financial_status !== "voided") {
        try {
          await shopifyFetch(`/orders/${order.id}/cancel.json`, { method: "POST", body: JSON.stringify({}) });
          cancelled++;
          await wait(1000);
        } catch (cancelErr) {
          console.log(`    Cancel failed (${cancelErr.message}), trying delete anyway...`);
        }
      }

      // Step 2: Delete (move to trash)
      const delUrl = `${BASE_URL}/orders/${order.id}.json`;
      const delRes = await fetch(delUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": TOKEN,
        },
      });

      if (delRes.status === 429) {
        const retryAfter = parseFloat(delRes.headers.get("Retry-After") || "2");
        await wait(retryAfter * 1000);
        const retry = await fetch(delUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
        });
        if (retry.ok) {
          deleted++;
          console.log(`  Deleted: ${label}`);
        } else {
          const retryBody = await retry.text();
          console.error(`  DELETE FAILED (retry): ${label} — ${retry.status} ${retryBody.slice(0, 200)}`);
          errors++;
        }
      } else if (delRes.ok) {
        deleted++;
        console.log(`  Deleted: ${label}`);
      } else {
        const errBody = await delRes.text();
        console.error(`  DELETE FAILED: ${label} — ${delRes.status} ${errBody.slice(0, 200)}`);
        errors++;
      }

      await wait(550);
    } catch (err) {
      console.error(`  FAILED: ${label} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\n--- Results ---`);
  console.log(`Deleted: ${deleted}`);
  console.log(`Cancelled first: ${cancelled}`);
  console.log(`Errors: ${errors}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
