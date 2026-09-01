#!/usr/bin/env node

/**
 * Sync Shopify variant SKUs to match Mangomint SKUs via API.
 *
 * Usage:
 *   node sync-skus.js            (dry run — shows what would change)
 *   node sync-skus.js --apply    (actually updates Shopify)
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

// ── Complete mapping: Shopify product title → new SKU(s) ──
// For multi-variant products, variantOpt picks the right variant by Option1 value.
const MAPPING = [
  // Single-variant products
  { sp: "Salicylic+ Serum", sku: "Ss" },
  { sp: "Clear Plex 10%", sku: "cp" },
  { sp: "Clear Plex 2.8%", sku: "cp" },
  { sp: "Clear Plex 5%", sku: "cp" },
  { sp: "Hydroxi Acne Cream", sku: "hac" },
  { sp: "L-Mandelic Face & Body Wash", sku: "Lmfbw" },
  { sp: "Barrier Balance Creamy Cleanser", sku: "Bbcc" },
  { sp: "Brighten-C Mask", sku: "Bcm" },
  { sp: "Hydracalm Mask", sku: "Hcm" },
  { sp: "Barrier Care Gel Cream", sku: "Bcgc" },
  { sp: "Cran-Peptide Cream", sku: "Cpc" },
  { sp: "Hush Hydrate Gel", sku: "hhg" },
  { sp: "Light Aloe Moisturizer", sku: "la" },
  { sp: "Relief Bio Powder", sku: "rbp" },
  { sp: "Refine Polish", sku: "rp" },
  { sp: "Raspberry Refining Scrub", sku: "rrs" },
  { sp: "Antioxidant Peptide Eye Gel", sku: "Frpep" },
  { sp: "Antioxidant Peptide Face Serum", sku: "Apfs" },
  { sp: "Sulfur Spot Treatment", sku: "Sst" },
  { sp: "Remedy Rehab Oil", sku: "rro" },
  { sp: "Ageless Hydrating Serum", sku: "ageless" },
  { sp: "Citrus-C Nourishing Cream", sku: "cc" },
  { sp: "Peptide Eye Serum", sku: "sspep" },
  { sp: "Daily SPF 30 Plus", sku: "Dspf" },
  { sp: "Mineral Matte SPF 28", sku: "Mspf" },
  { sp: "Calming Facial Toner", sku: "Frct" },
  { sp: "Soothing Radiance Toner", sku: "SRT" },
  { sp: "Clarifying Toner Pads", sku: "ctp" },
  { sp: "Premium Compressed Face Cleansing Towels", sku: "mpct" },
  { sp: "clearDerma Moisturizer", sku: "Cd" },
  { sp: "Hydrabalance Hydrating Gel", sku: "Hb" },
  { sp: "hydraRemedy Gel Serum", sku: "Hr" },
  { sp: "GlowTone™ Corrective Serum", sku: "Gt" },
  { sp: "Brilliant Eye & Lip Serum", sku: "bles" },
  { sp: "Beta-Glucan Serum", sku: "bgs" },
  { sp: "Ingrown Hair & Body Acne Serum", sku: "88" },
  { sp: "Tri-Peptide Eye Cream", sku: "tripep" },
  { sp: "Peptide Rescue Cream", sku: "mpr" },
  { sp: "Mixi Mist Hypochlorous Acid Spray", sku: "MM" },
  { sp: "Refresh Hand + Body Lotion", sku: "refresh" },
  { sp: "Relax Hand + Body Lotion", sku: "relax" },
  { sp: "Zen Hand + Body Lotion", sku: "zen" },
  { sp: "Acai Berry Moisturizer", sku: "acai" },
  { sp: "Glycolic and Retinol Pads", sku: "Grp" },
  { sp: "Pomegranate Antioxidant Cleanser", sku: "Pac" },
  { sp: "Charcoal Clarifying Mask", sku: "Ccm" },
  { sp: "Hush Hydrate Gel & Relief Bio Powder Duo", sku: "Duo" },
  { sp: "Steel Eye Rollers", sku: "Erp" },
  { sp: "2x2 Dental Gauze For Toner", sku: "2x2dg" },
  { sp: "Retinol 2% Exfoliating Scrub/Mask", sku: "R2esm" },

  // Mandelic serums: Face Reality = plain name, Mixi = "L-Mandelic"
  { sp: "5% Mandelic Serum", sku: "Fms5" },
  { sp: "8% Mandelic Serum", sku: "Fms8" },
  { sp: "11% Mandelic Serum", sku: "Fms11" },
  { sp: "15% Mandelic Serum", sku: "Fms15" },
  { sp: "5% L-Mandelic Serum", sku: "mms5" },
  { sp: "8% L-Mandelic Serum", sku: "mms8" },
  { sp: "11% L-Mandelic Serum", sku: "mms11" },

  // SPF products
  { sp: "TIZO2 Facial Primer Non-Tinted", sku: "psnt" },
  { sp: "TIZO3 Facial Primer Tinted", sku: "pst" },
  { sp: "Ultra Zinc Body & Face Non-Tinted", sku: "uznt" },
  { sp: "Ultra Zinc Body & Face Tinted", sku: "uzt" },

  // Multi-variant products (variantOpt picks the right size)
  { sp: "Moisture Balance Toner", variantOpt: "6 oz", sku: "Mbt" },
  { sp: "Moisture Balance Toner", variantOpt: "2 oz", sku: "minimbt" },
  { sp: "Ultra Gentle Gel Cleanser", variantOpt: "6oz", sku: "Ugc" },
  { sp: "Ultra Gentle Gel Cleanser", variantOpt: "2oz", sku: "TsUgc" },
  { sp: "Sal-C Toner", variantOpt: "4fl oz", sku: "Sct" },
  { sp: "Cucumber Hydration Toner", variantOpt: "3.3 oz", sku: "ct" },
  { sp: "Calming Cleansing Oil & Makeup Remover", variantOpt: "4 fl oz", sku: "mc" },
  { sp: "Calming Cleansing Oil & Makeup Remover", variantOpt: "1 fl oz", sku: "mc" },
  { sp: "Botanical Bloom Hydrating Mask", variantOpt: "2 oz", sku: "Bbhm" },
  { sp: "Botanical Bloom Hydrating Mask", variantOpt: ".25 oz", sku: "miniBbhm" },
  { sp: "Stress Remedy Hand + Body Lotion", variantOpt: "4fl oz", sku: "stress" },
  { sp: "Quiet Wash Cleanser", variantOpt: "3.3 oz", sku: "qw 3.3" },
];

async function fetchAllProducts() {
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

  console.log("Fetching Shopify products...");
  const products = await fetchAllProducts();
  console.log(`  ${products.length} products found\n`);

  // Build title lookup (lowercase) — maps to array of products (handles dupes)
  const byTitle = new Map();
  for (const p of products) {
    const key = p.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(p);
  }

  const updates = [];
  const skipped = [];

  for (const entry of MAPPING) {
    const prods = byTitle.get(entry.sp.toLowerCase());
    if (!prods || prods.length === 0) {
      skipped.push({ title: entry.sp, sku: entry.sku, reason: "Product not found in Shopify" });
      continue;
    }

    for (const prod of prods) {
      let variant;
      if (entry.variantOpt) {
        variant = prod.variants.find(
          (v) => v.option1?.toLowerCase() === entry.variantOpt.toLowerCase()
        );
        if (!variant) {
          skipped.push({
            title: entry.sp,
            sku: entry.sku,
            reason: `Variant "${entry.variantOpt}" not found`,
          });
          continue;
        }
      } else if (prod.variants.length === 1) {
        variant = prod.variants[0];
      } else {
        variant = prod.variants[0];
      }

      if (variant.sku === entry.sku) {
        skipped.push({ title: entry.sp, sku: entry.sku, reason: "Already correct" });
        continue;
      }

      updates.push({
        title: prod.title,
        variantId: variant.id,
        variantTitle: variant.title,
        oldSku: variant.sku || "(empty)",
        newSku: entry.sku,
      });
    }
  }

  // Report planned changes
  console.log(`CHANGES (${updates.length}):`);
  console.log("─".repeat(60));
  for (const u of updates) {
    const suffix = u.variantTitle !== "Default Title" ? ` [${u.variantTitle}]` : "";
    console.log(`  ${u.title}${suffix}`);
    console.log(`    ${u.oldSku}  →  ${u.newSku}`);
  }

  if (skipped.length) {
    console.log(`\nSKIPPED (${skipped.length}):`);
    console.log("─".repeat(60));
    for (const s of skipped) {
      console.log(`  ${s.title} [${s.sku}] — ${s.reason}`);
    }
  }

  // Apply
  if (updates.length && !DRY_RUN) {
    console.log("\nApplying updates...");
    let success = 0, failed = 0;
    for (const u of updates) {
      try {
        await updateVariantSku(u.variantId, u.newSku);
        console.log(`  ✓ ${u.title}: ${u.oldSku} → ${u.newSku}`);
        success++;
      } catch (e) {
        console.log(`  ✗ ${u.title}: ${e.message}`);
        failed++;
      }
    }
    console.log(`\nDone: ${success} updated, ${failed} failed`);
  } else if (updates.length && DRY_RUN) {
    console.log(`\nRun with --apply to update ${updates.length} SKUs.`);
  } else {
    console.log("\nAll SKUs already match. Nothing to update.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
