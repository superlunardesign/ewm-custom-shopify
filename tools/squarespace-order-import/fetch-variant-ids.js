#!/usr/bin/env node

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

async function main() {
  let url = "/products.json?limit=250";
  const all = [];

  while (url) {
    const fullUrl = `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
      headers: { "X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json" },
    });

    if (res.status === 429) {
      await wait(2000);
      continue;
    }

    const body = await res.json();
    if (body.products) {
      for (const p of body.products) {
        for (const v of (p.variants || [])) {
          all.push({
            handle: p.handle,
            title: p.title,
            variant_id: v.id,
            variant_title: v.title,
            sku: v.sku || "",
            price: v.price,
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
      } else url = null;
    } else url = null;

    await wait(550);
  }

  for (const p of all) {
    console.log(`${p.handle} | ${p.title} | ${p.variant_id} | ${p.sku} | $${p.price}`);
  }
}

main().catch(console.error);
