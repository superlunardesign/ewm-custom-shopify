#!/usr/bin/env node

/**
 * Update Shopify variant SKUs to match Mangomint SKUs.
 * Matches products by name, then updates Shopify SKUs.
 *
 * Usage:
 *   node update-shopify-skus.js <path-to-mangomint-csv>          (dry run)
 *   node update-shopify-skus.js <path-to-mangomint-csv> --apply  (actually update)
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
const DRY_RUN = !process.argv.includes("--apply");

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
      name: cols[1]?.trim(),
      brand: cols[2]?.trim(),
      price: cols[3]?.replace("$", "").trim(),
      sku: cols[8]?.trim() || "",
    });
  }
  return products;
}

async function fetchAllShopifyProducts() {
  const products = [];
  let url = "/products.json?limit=250";
  while (url) {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: { "X-Shopify-Access-Token": TOKEN },
    });
    if (res.status === 429) { await wait(2000); continue; }
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const data = await res.json();
    products.push(...data.products);
    const link = res.headers.get("link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1].replace(BASE_URL, "") : null;
    await wait(500);
  }
  return products;
}

async function updateVariantSku(variantId, newSku) {
  const res = await fetch(`${BASE_URL}/variants/${variantId}.json`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ variant: { id: variantId, sku: newSku } }),
  });
  if (res.status === 429) {
    await wait(2000);
    return updateVariantSku(variantId, newSku);
  }
  if (!res.ok) throw new Error(`Failed to update variant ${variantId}: ${res.status}`);
  await wait(500);
  return res.json();
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath || csvPath === "--apply") {
    console.error("Usage: node update-shopify-skus.js <mangomint-csv> [--apply]");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("══════════════════════════════════════════════════════");
    console.log("  DRY RUN — no changes will be made");
    console.log("  Add --apply to actually update Shopify SKUs");
    console.log("══════════════════════════════════════════════════════\n");
  } else {
    console.log("══════════════════════════════════════════════════════");
    console.log("  LIVE MODE — Shopify SKUs will be updated");
    console.log("══════════════════════════════════════════════════════\n");
  }

  console.log("Parsing Mangomint CSV...");
  const mmProducts = parseCSV(readFileSync(csvPath, "utf8"));

  console.log("Fetching Shopify products...");
  const shopifyProducts = await fetchAllShopifyProducts();
  console.log(`  ${shopifyProducts.length} Shopify products\n`);

  // Build Shopify lookup by lowercase title
  const shopifyByTitle = new Map();
  for (const prod of shopifyProducts) {
    const key = prod.title.toLowerCase().trim();
    if (!shopifyByTitle.has(key)) shopifyByTitle.set(key, []);
    shopifyByTitle.get(key).push(prod);
  }

  const willUpdate = [];
  const needsManualReview = [];
  const alreadyCorrect = [];
  const noShopifyMatch = [];

  for (const mm of mmProducts) {
    if (!mm.sku) continue; // skip Mangomint products with no SKU

    const key = mm.name.toLowerCase().trim();
    const shopifyMatches = shopifyByTitle.get(key);

    if (!shopifyMatches || shopifyMatches.length === 0) {
      noShopifyMatch.push(mm);
      continue;
    }

    for (const sp of shopifyMatches) {
      if (sp.variants.length === 1) {
        const v = sp.variants[0];
        if (v.sku?.toLowerCase() === mm.sku.toLowerCase()) {
          alreadyCorrect.push({ mm, shopify: sp, variant: v });
        } else {
          willUpdate.push({ mm, shopify: sp, variant: v, oldSku: v.sku || "(empty)", newSku: mm.sku });
        }
      } else {
        // Multi-variant: try to match by price
        const mmPrice = parseFloat(mm.price);
        const priceMatch = sp.variants.find(v => parseFloat(v.price) === mmPrice);

        if (priceMatch) {
          if (priceMatch.sku?.toLowerCase() === mm.sku.toLowerCase()) {
            alreadyCorrect.push({ mm, shopify: sp, variant: priceMatch });
          } else {
            willUpdate.push({
              mm, shopify: sp, variant: priceMatch,
              oldSku: priceMatch.sku || "(empty)", newSku: mm.sku,
              note: `matched variant "${priceMatch.title}" by price $${mm.price}`,
            });
          }
        } else {
          needsManualReview.push({
            mm,
            shopify: sp,
            variants: sp.variants.map(v => ({
              id: v.id, title: v.title, sku: v.sku, price: v.price,
            })),
          });
        }
      }
    }
  }

  // Report
  if (alreadyCorrect.length) {
    console.log(`✓ ALREADY CORRECT (${alreadyCorrect.length}):`);
    for (const item of alreadyCorrect) {
      console.log(`  ${item.mm.name} — SKU: ${item.mm.sku}`);
    }
    console.log();
  }

  if (willUpdate.length) {
    console.log(`→ WILL UPDATE (${willUpdate.length}):`);
    for (const item of willUpdate) {
      console.log(`  ${item.mm.name}`);
      console.log(`    ${item.oldSku}  →  ${item.newSku}${item.note ? `  (${item.note})` : ""}`);
    }
    console.log();
  }

  if (needsManualReview.length) {
    console.log(`⚠ NEEDS MANUAL REVIEW — multiple variants, couldn't auto-match (${needsManualReview.length}):`);
    for (const item of needsManualReview) {
      console.log(`  ${item.mm.name} [Mangomint SKU: ${item.mm.sku}, price: $${item.mm.price}]`);
      console.log(`    Shopify "${item.shopify.title}" variants:`);
      for (const v of item.variants) {
        console.log(`      - "${v.title}" SKU: ${v.sku || "(empty)"} Price: $${v.price}`);
      }
    }
    console.log();
  }

  // Apply updates
  if (willUpdate.length && !DRY_RUN) {
    console.log("Applying updates...");
    let success = 0, failed = 0;
    for (const item of willUpdate) {
      try {
        await updateVariantSku(item.variant.id, item.newSku);
        console.log(`  ✓ ${item.mm.name}: ${item.oldSku} → ${item.newSku}`);
        success++;
      } catch (e) {
        console.log(`  ✗ ${item.mm.name}: ${e.message}`);
        failed++;
      }
    }
    console.log(`\nDone: ${success} updated, ${failed} failed`);
  } else if (willUpdate.length) {
    console.log(`Run with --apply to update ${willUpdate.length} SKUs in Shopify.`);
  }

  console.log("\n--- SUMMARY ---");
  console.log(`  Already correct:    ${alreadyCorrect.length}`);
  console.log(`  Will update:        ${willUpdate.length}`);
  console.log(`  Needs manual review:${needsManualReview.length}`);
  console.log(`  No Shopify match:   ${noShopifyMatch.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
