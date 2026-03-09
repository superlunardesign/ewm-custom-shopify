/**
 * Back-in-Stock Cloudflare Worker
 * ================================
 * Deploy this as a Cloudflare Worker to bridge storefront JS → Shopify Admin API.
 *
 * SETUP:
 * 1. Create a free Cloudflare account at https://dash.cloudflare.com
 * 2. Go to Workers & Pages → Create Worker
 * 3. Paste this code into the worker editor
 * 4. Set environment variables (Settings → Variables):
 *    - SHOPIFY_STORE: your-store.myshopify.com
 *    - SHOPIFY_ADMIN_TOKEN: your Admin API access token (with write_customers scope)
 *    - ALLOWED_ORIGIN: https://your-store.com (your storefront domain)
 * 5. Copy the Worker URL (e.g., https://bis-worker.your-account.workers.dev)
 * 6. Paste it into Shopify Theme Customizer → Theme Settings → "Back-in-Stock Worker URL"
 *
 * SHOPIFY ADMIN TOKEN SETUP:
 * 1. Shopify Admin → Settings → Apps and sales channels → Develop apps
 * 2. Create an app → Configure Admin API scopes → check "write_customers"
 * 3. Install app → reveal Admin API access token → copy it
 */

export default {
  async fetch(request, env) {
    /* ---- CORS ---- */
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /* Verify origin */
    if (allowed && !origin.includes(allowed.replace('https://', '').replace('http://', ''))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      const { action, customer_id, handle } = body;

      if (!customer_id || !handle) {
        return new Response(JSON.stringify({ error: 'Missing customer_id or handle' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const tag = 'bis:' + handle;
      const shopifyBase = `https://${env.SHOPIFY_STORE}/admin/api/2024-01`;
      const headers = {
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
        'Content-Type': 'application/json',
      };

      /* Get current customer tags */
      const custRes = await fetch(`${shopifyBase}/customers/${customer_id}.json`, { headers });
      if (!custRes.ok) {
        return new Response(JSON.stringify({ error: 'Customer not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const custData = await custRes.json();
      let tags = custData.customer.tags
        ? custData.customer.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      if (action === 'add') {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      } else if (action === 'remove') {
        tags = tags.filter(t => t !== tag);
      } else {
        return new Response(JSON.stringify({ error: 'Invalid action. Use "add" or "remove".' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      /* Update customer tags */
      const updateRes = await fetch(`${shopifyBase}/customers/${customer_id}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ customer: { id: Number(customer_id), tags: tags.join(', ') } }),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        return new Response(JSON.stringify({ error: 'Failed to update tags', details: errText }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, tags: tags.join(', ') }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Server error', message: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
