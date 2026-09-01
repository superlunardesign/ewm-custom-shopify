#!/usr/bin/env node

/**
 * Match Mangomint product SKUs to Shopify product SKUs.
 * Run from the same directory as your .env file:
 *   node match-skus.js path/to/Product_Export.csv
 */

import { readFileSync, existsSync } from "fs";
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

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const products = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let current = "", inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current); current = ""; continue; }
      current += ch;
    }
    cols.push(current);
    products.push({
      mmId: cols[0]?.trim(),
      name: cols[1]?.trim(),
      brand: cols[2]?.trim(),
      price: cols[3]?.trim(),
      category: cols[5]?.trim(),
      sku: cols[8]?.trim() || "",
    });
  }
  return products;
}

async function fetchAllShopifyProducts() {
  const products = [];
  let url = "/products.json?limit=250&fields=id,title,variants,vendor";
  while (url) {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: { "X-Shopify-Access-Token": TOKEN },
    });
    if (res.status === 429) {
      await wait(2000);
      continue;
    }
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const data = await res.json();
    products.push(...data.products);

    const link = res.headers.get("link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    if (next) {
      url = next[1].replace(BASE_URL, "");
    } else {
      url = null;
    }
    await wait(500);
  }
  return products;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node match-skus.js <path-to-mangomint-csv>");
    process.exit(1);
  }
  if (!existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log("Parsing Mangomint CSV...");
  const mmProducts = parseCSV(readFileSync(csvPath, "utf8"));
  console.log(`  ${mmProducts.length} Mangomint products found\n`);

  console.log("Fetching Shopify products...");
  const shopifyProducts = await fetchAllShopifyProducts();
  console.log(`  ${shopifyProducts.length} Shopify products found\n`);

  // Build Shopify lookup maps
  const shopifyBySku = new Map();    // SKU -> [{product, variant}]
  const shopifyByTitle = new Map();  // lowercase title -> [{product, variant}]
  for (const prod of shopifyProducts) {
    const titleKey = prod.title.toLowerCase().trim();
    if (!shopifyByTitle.has(titleKey)) shopifyByTitle.set(titleKey, []);
    shopifyByTitle.get(titleKey).push(prod);

    for (const v of prod.variants) {
      if (v.sku) {
        const skuKey = v.sku.toLowerCase().trim();
        if (!shopifyBySku.has(skuKey)) shopifyBySku.set(skuKey, []);
        shopifyBySku.get(skuKey).push({ product: prod, variant: v });
      }
    }
  }

  const matched = [];
  const skuMismatch = [];
  const nameOnlyMatch = [];
  const noMatch = [];

  for (const mm of mmProducts) {
    const mmSku = mm.sku.toLowerCase().trim();
    const mmName = mm.name.toLowerCase().trim();

    if (mmSku && shopifyBySku.has(mmSku)) {
      const hits = shopifyBySku.get(mmSku);
      matched.push({ mm, shopify: hits });
    } else if (mmSku) {
      // Has SKU but no Shopify match — check by name
      const nameHits = shopifyByTitle.get(mmName);
      if (nameHits) {
        skuMismatch.push({ mm, shopify: nameHits });
      } else {
        noMatch.push(mm);
      }
    } else {
      // No Mangomint SKU — try name match
      const nameHits = shopifyByTitle.get(mmName);
      if (nameHits) {
        nameOnlyMatch.push({ mm, shopify: nameHits });
      } else {
        noMatch.push(mm);
      }
    }
  }

  // Report
  console.log("=".repeat(70));
  console.log(`MATCHED BY SKU (${matched.length})`);
  console.log("=".repeat(70));
  for (const m of matched) {
    for (const s of m.shopify) {
      console.log(`  ✓ [${m.mm.sku}] ${m.mm.name}`);
      console.log(`    → Shopify: ${s.product.title} (${s.variant.title}) SKU: ${s.variant.sku}`);
    }
  }

  if (skuMismatch.length) {
    console.log();
    console.log("=".repeat(70));
    console.log(`SKU MISMATCH — name matches but SKU differs (${skuMismatch.length})`);
    console.log("=".repeat(70));
    for (const m of skuMismatch) {
      const shopifySkus = m.shopify.flatMap(p => p.variants?.map(v => v.sku) || []).filter(Boolean);
      console.log(`  ⚠ Mangomint: [${m.mm.sku}] ${m.mm.name}`);
      console.log(`    Shopify:   [${shopifySkus.join(", ")}] ${m.shopify[0].title}`);
    }
  }

  if (nameOnlyMatch.length) {
    console.log();
    console.log("=".repeat(70));
    console.log(`MATCHED BY NAME ONLY — no Mangomint SKU (${nameOnlyMatch.length})`);
    console.log("=".repeat(70));
    for (const m of nameOnlyMatch) {
      const shopifySkus = m.shopify.flatMap(p => p.variants?.map(v => v.sku) || []).filter(Boolean);
      console.log(`  ~ ${m.mm.name}`);
      console.log(`    Shopify SKU(s): ${shopifySkus.length ? shopifySkus.join(", ") : "(none)"}`);
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`NO MATCH IN SHOPIFY (${noMatch.length})`);
  console.log("=".repeat(70));
  for (const m of noMatch) {
    console.log(`  ✗ ${m.name}${m.sku ? ` [SKU: ${m.sku}]` : ""} | ${m.category} | ${m.brand}`);
  }

  console.log();
  console.log("--- SUMMARY ---");
  console.log(`  Matched by SKU:      ${matched.length}`);
  console.log(`  SKU mismatch:        ${skuMismatch.length}`);
  console.log(`  Name-only match:     ${nameOnlyMatch.length}`);
  console.log(`  No match:            ${noMatch.length}`);
  console.log(`  Total Mangomint:     ${mmProducts.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
