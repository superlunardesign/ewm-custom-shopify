#!/usr/bin/env node

/**
 * Bulk-update product metafields (ingredients, how_to_use, why_we_love_it)
 * from a crawled CSV export. Only fills EMPTY metafields — never overwrites
 * existing data.
 *
 * Usage:
 *   node update-metafields.js <path-to-csv>          # dry run
 *   node update-metafields.js <path-to-csv> --apply   # actually update
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) { console.error("Missing .env — copy .env.example and fill in credentials"); process.exit(1); }
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
const APPLY = process.argv.includes("--apply");

const METAFIELD_MAP = [
  { csvCol: "ingredients",     namespace: "custom", key: "ingredients" },
  { csvCol: "how_to_use",     namespace: "custom", key: "how_to_use" },
  { csvCol: "why_we_love_it", namespace: "custom", key: "why_we_love_it" },
];

function parseCSV(text) {
  const lines = text.split("\n");
  const headerLine = lines[0];
  const headers = [];
  let current = "", inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { headers.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  headers.push(current.trim());

  const rows = [];
  let i = 1;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }

    let row = lines[i];
    let quoteCount = (row.match(/"/g) || []).length;
    while (quoteCount % 2 !== 0 && i + 1 < lines.length) {
      i++;
      row += "\n" + lines[i];
      quoteCount = (row.match(/"/g) || []).length;
    }

    const cols = [];
    let col = "", q = false;
    for (const ch of row) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cols.push(col); col = ""; continue; }
      col += ch;
    }
    cols.push(col);

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (cols[j] || "").trim();
    }
    rows.push(obj);
    i++;
  }
  return rows;
}

async function shopifyGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
  });
  if (res.status === 429) { await wait(2000); return shopifyGet(path); }
  if (!res.ok) return null;
  return res.json();
}

async function getProductBySku(sku) {
  const data = await shopifyGet(`/products.json?fields=id,title,variants&limit=250`);
  if (!data) return null;
  for (const p of data.products) {
    for (const v of p.variants) {
      if (v.sku && v.sku.toLowerCase() === sku.toLowerCase()) {
        return { id: p.id, title: p.title };
      }
    }
  }
  return null;
}

async function getAllProducts() {
  let products = [];
  let url = `/products.json?fields=id,title,variants&limit=250`;
  while (url) {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: { "X-Shopify-Access-Token": TOKEN },
    });
    if (res.status === 429) { await wait(2000); continue; }
    if (!res.ok) break;
    const data = await res.json();
    products = products.concat(data.products);

    const link = res.headers.get("link");
    if (link && link.includes('rel="next"')) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        const nextUrl = new URL(match[1]);
        url = nextUrl.pathname.replace(`/admin/api/${API_VERSION}`, "") + nextUrl.search;
      } else { break; }
    } else { break; }
    await wait(300);
  }
  return products;
}

async function getExistingMetafields(productId) {
  const data = await shopifyGet(`/products/${productId}/metafields.json`);
  if (!data) return {};
  const map = {};
  for (const mf of data.metafields) {
    map[`${mf.namespace}.${mf.key}`] = mf.value;
  }
  return map;
}

async function setMetafield(productId, namespace, key, value) {
  const res = await fetch(`${BASE_URL}/products/${productId}/metafields.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metafield: {
        namespace,
        key,
        value,
        type: "multi_line_text_field",
      },
    }),
  });
  if (res.status === 429) { await wait(2000); return setMetafield(productId, namespace, key, value); }
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `${res.status} — ${body}` };
  }
  return { ok: true };
}

async function main() {
  const csvPath = process.argv.find((a) => !a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1]);
  if (!csvPath) {
    console.error("Usage: node update-metafields.js <path-to-csv> [--apply]");
    process.exit(1);
  }

  const fullPath = resolve(csvPath);
  if (!existsSync(fullPath)) { console.error(`File not found: ${fullPath}`); process.exit(1); }

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`CSV:  ${fullPath}\n`);

  const rows = parseCSV(readFileSync(fullPath, "utf8"));
  console.log(`CSV rows: ${rows.length}`);

  const csvWithContent = rows.filter((r) =>
    METAFIELD_MAP.some((m) => r[m.csvCol] && r[m.csvCol].trim())
  );
  console.log(`Rows with metafield content: ${csvWithContent.length}\n`);

  console.log("Fetching all Shopify products...");
  const allProducts = await getAllProducts();
  console.log(`Found ${allProducts.length} products in Shopify\n`);

  const skuMap = new Map();
  for (const p of allProducts) {
    for (const v of p.variants) {
      if (v.sku) skuMap.set(v.sku.toLowerCase(), { id: p.id, title: p.title });
    }
  }

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let failed = 0;
  let alreadyFilled = 0;

  for (const row of csvWithContent) {
    const sku = (row.sku || "").trim();
    if (!sku) { noMatch++; continue; }

    const product = skuMap.get(sku.toLowerCase());
    if (!product) {
      console.log(`  ? No match for SKU "${sku}" (${row.title})`);
      noMatch++;
      continue;
    }

    let existingMeta = {};
    if (APPLY) {
      existingMeta = await getExistingMetafields(product.id);
      await wait(300);
    }

    for (const mf of METAFIELD_MAP) {
      const csvValue = (row[mf.csvCol] || "").trim();
      if (!csvValue) continue;

      const metaKey = `${mf.namespace}.${mf.key}`;

      if (APPLY) {
        const existing = existingMeta[metaKey];
        if (existing && existing.trim()) {
          console.log(`  ~ SKIP ${product.title} → ${mf.key} (already has content)`);
          alreadyFilled++;
          continue;
        }

        const result = await setMetafield(product.id, mf.namespace, mf.key, csvValue);
        if (result.ok) {
          console.log(`  + SET  ${product.title} → ${mf.key}`);
          updated++;
        } else {
          console.log(`  ! FAIL ${product.title} → ${mf.key}: ${result.error}`);
          failed++;
        }
        await wait(300);
      } else {
        console.log(`  → Would set ${product.title} → ${mf.key} (${csvValue.length} chars)`);
        updated++;
      }
    }
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`  ${APPLY ? "Updated" : "Would update"}: ${updated}`);
  console.log(`  Skipped (already filled): ${alreadyFilled}`);
  console.log(`  No SKU match: ${noMatch}`);
  if (APPLY) console.log(`  Failed: ${failed}`);
  if (!APPLY) console.log(`\nDry run complete. Run with --apply to update metafields.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
