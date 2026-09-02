#!/usr/bin/env node

/**
 * Bulk-create Shopify URL redirects from old Squarespace paths to Shopify product URLs.
 * Maps /shop-skincare/p/{handle} → /products/{handle}
 *
 * Usage:
 *   node create-redirects.js          # dry run
 *   node create-redirects.js --apply  # create redirects
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
const APPLY = process.argv.includes("--apply");

const PRODUCT_HANDLES = [
  "agent-88-ingrown-hair-body-acne-serum",
  "antioxidant-peptide-eye-gel-face-reality",
  "green-envee-balance-hand-body-lotion",
  "face-reality-barrier-balance-creamy-cleanser",
  "botanical-bloom-hydrating-mask",
  "hale-hush-brilliant-eye-lip-serum",
  "11-l-mandelic-serum",
  "glowtone%E2%84%A2-corrective-serum-face-reality",
  "hydraremedy-gel-serum",
  "hydroxi-acne-cream",
  "15-mandelic-serum-face-reality",
  "acai-berry-moisturizer",
  "ageless-hydrating-serum",
  "antioxidant-peptide-face-serum",
  "brighten-c-mask-face-reality",
  "citrus-c-nourishing-cream",
  "clarifying-toner-pads",
  "cran-peptide-cream",
  "cucumber-hydration-toner",
  "daily-spf-30-lotion",
  "glycolicandreinolpads",
  "golden-mist-cup-weny8-srrdt",
  "haleandhushduo",
  "hydrabalance",
  "hydracalm-mask",
  "lightaloemoisturizer",
  "lust-for-life",
  "michele-corley-pore-clearing-cleansing-oil",
  "monolith",
  "peptide-eye-serum",
  "pomegranate-antioxidant-cleanser",
  "quiet-wash",
  "raspberry-refining-scrub-skin-script",
  "refine-polish-exfoliant-hale-hush",
  "refresh-hand-body-lotion",
  "relief-bio-powder",
  "remedy-rehab-oil",
  "retinol-2-exfoliating-scrub-mask",
  "saint-tropez",
  "sal-c-toner-face-reality",
  "salicylic-serum",
  "spring-bowl-rltkk-dnchc",
  "steel-eye-roller",
  "stress-remedy-hand-body-lotion",
  "sulfur-spot-treatment",
  "tizo-primer-sunscreen-non-tinted",
  "tizo-primer-sunscreen-tinted",
  "ultimate-protection-spf-28",
  "ultra-zinc-body-face-non-tinted",
  "ultrazincbodyandfacetinted",
  "v5xfxmdwvahg1dyaeqqxvu5eke0550",
  "soothing-radiance-toner",
  "barrier-care-gel-cream",
  "mixi-mist",
  "beta-serum",
  "anteage-biogel",
  "2x2-dental-gauze-pads-for-toner",
  "mixi-peptide-rescue-cream",
  "tri-peptide-eye-cream",
  "charcoal-clarifying-mask",
  "hush-hydrate-gel-hale-hush",
  "zen-hand-body-lotion",
  "relax-hand-body-lotion",
  "sport-spf-50-lotion-solrx",
  "sport-spf-50-continuous-spray-solrx",
  "femme-fatale-candle-8oz-tuff-peach-craft-co",
  "ramble-on-candle-8oz-tuff-peach-craft-co",
  "sun-king-candle-8oz",
  "mixi-premium-compressed-towels",
  "gift-card-for-facial-spa-in-mchenry-il-esthetics-with-me",
  "clear-plex-10",
  "8-mandelic-serum",
  "11-mandelic-serum",
  "clear-plex-2-8",
  "clear-plex-5",
  "11-mandelic-serum-1",
  "5-mandelic-serum",
  "ultra-gentle-gel-cleanser",
  "moisture-balance-toner",
];

async function createRedirect(fromPath, toPath) {
  const res = await fetch(`${BASE_URL}/redirects.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirect: { path: fromPath, target: toPath },
    }),
  });

  if (res.status === 429) {
    await wait(2000);
    return createRedirect(fromPath, toPath);
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, from: fromPath, error: `${res.status} — ${body}` };
  }

  return { ok: true, from: fromPath, to: toPath };
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Redirects to create: ${PRODUCT_HANDLES.length}\n`);

  const redirects = PRODUCT_HANDLES.map((handle) => {
    const decoded = decodeURIComponent(handle);
    return {
      from: `/shop-skincare/p/${decoded}`,
      to: `/products/${handle}`,
    };
  });

  if (!APPLY) {
    for (const r of redirects) {
      console.log(`  ${r.from}  →  ${r.to}`);
    }
    console.log(`\nDry run complete. Run with --apply to create redirects.`);
    return;
  }

  let created = 0;
  let failed = 0;

  for (const r of redirects) {
    const result = await createRedirect(r.from, r.to);
    if (result.ok) {
      created++;
      console.log(`  ✓ ${r.from}  →  ${r.to}`);
    } else {
      failed++;
      console.log(`  ✗ ${r.from}  —  ${result.error}`);
    }
    await wait(300);
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`  Created: ${created}`);
  console.log(`  Failed:  ${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
