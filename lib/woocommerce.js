// Read-only WooCommerce lookups, scoped to one store's credentials.
// Start with read access only on each store's REST API key - the agent
// should not be able to modify orders through this module.

function authHeader(store) {
  const token = Buffer.from(
    `${store.woocommerce_consumer_key}:${store.woocommerce_consumer_secret}`
  ).toString('base64');
  return `Basic ${token}`;
}

function hasWooCommerce(store) {
  return !!(store.woocommerce_url && store.woocommerce_consumer_key);
}

async function lookupOrder(store, orderIdOrEmail) {
  if (!hasWooCommerce(store)) return null;
  const base = store.woocommerce_url.replace(/\/$/, '');
  const isEmail = orderIdOrEmail.includes('@');

  const url = isEmail
    ? `${base}/wp-json/wc/v3/orders?search=${encodeURIComponent(orderIdOrEmail)}&per_page=5`
    : `${base}/wp-json/wc/v3/orders/${encodeURIComponent(orderIdOrEmail)}`;

  const res = await fetch(url, { headers: { Authorization: authHeader(store) } });
  if (!res.ok) return null;
  return res.json();
}

async function searchProducts(store, query, limit = 5) {
  if (!hasWooCommerce(store)) return [];
  const base = store.woocommerce_url.replace(/\/$/, '');

  if (!query) {
    const res = await fetch(`${base}/wp-json/wc/v3/products?per_page=${limit}`, {
      headers: { Authorization: authHeader(store) },
    });
    return res.ok ? res.json() : [];
  }

  const searchRes = await fetch(
    `${base}/wp-json/wc/v3/products?search=${encodeURIComponent(query)}&per_page=${limit}`,
    { headers: { Authorization: authHeader(store) } }
  );
  if (searchRes.ok) {
    const items = await searchRes.json();
    if (items.length > 0) return items;
  }

  // Fallback: WooCommerce's ?search= sometimes misses products whose
  // description (not title) contains the matching word. Pull a broader
  // list and rank it client-side, same approach used for the knowledge
  // base and WordPress page/post search.
  const listRes = await fetch(`${base}/wp-json/wc/v3/products?per_page=50`, {
    headers: { Authorization: authHeader(store) },
  });
  if (!listRes.ok) return [];
  const allProducts = await listRes.json();

  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return allProducts.slice(0, limit);

  return allProducts
    .map((p) => {
      const haystack = `${p.name} ${p.short_description || ''} ${p.description || ''}`.toLowerCase();
      const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}

async function listOrders(store, { perPage = 10, status } = {}) {
  if (!hasWooCommerce(store)) return [];
  const base = store.woocommerce_url.replace(/\/$/, '');
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (status) params.set('status', status);
  const res = await fetch(`${base}/wp-json/wc/v3/orders?${params}`, {
    headers: { Authorization: authHeader(store) },
  });
  if (!res.ok) return [];
  return res.json();
}

// --- Management (write) actions ---
// Kept separate from the two read functions above on purpose: these are
// only ever called from the admin-authenticated api/admin/* endpoints,
// never from the customer-facing chat endpoint.

async function updateProductStock(store, productId, stockQuantity) {
  if (!hasWooCommerce(store)) throw new Error('Store has no WooCommerce credentials');
  const base = store.woocommerce_url.replace(/\/$/, '');
  const res = await fetch(`${base}/wp-json/wc/v3/products/${productId}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(store),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stock_quantity: stockQuantity, manage_stock: true }),
  });
  if (!res.ok) throw new Error(`WooCommerce update failed (${res.status})`);
  return res.json();
}

async function updateProductPrice(store, productId, regularPrice) {
  if (!hasWooCommerce(store)) throw new Error('Store has no WooCommerce credentials');
  const base = store.woocommerce_url.replace(/\/$/, '');
  const res = await fetch(`${base}/wp-json/wc/v3/products/${productId}`, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(store),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ regular_price: String(regularPrice) }),
  });
  if (!res.ok) throw new Error(`WooCommerce update failed (${res.status})`);
  return res.json();
}

module.exports = {
  lookupOrder,
  searchProducts,
  listOrders,
  updateProductStock,
  updateProductPrice,
};
