// Read-only lookups for the admin dashboard. Separate from
// api/admin/content.js and update-product.js, which handle writes.
const { getStore } = require('../../lib/store');
const { requireAdmin } = require('../../lib/admin-auth');
const wc = require('../../lib/woocommerce');
const wp = require('../../lib/wordpress');
const { listLeads } = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { storeId, resource, search } = req.body || {};
    if (!storeId || !resource) {
      return res.status(400).json({ error: 'storeId and resource are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    let items;
    if (resource === 'product') items = await wc.searchProducts(store, search, 20);
    else if (resource === 'order') items = await wc.listOrders(store, { perPage: 20 });
    else if (resource === 'post') items = await wp.listPosts(store, { search, status: 'any', perPage: 20 });
    else if (resource === 'page') items = await wp.listPages(store, { search, status: 'any', perPage: 20 });
    else if (resource === 'category') items = await wp.listCategories(store);
    else if (resource === 'lead') items = await listLeads(store.id);
    else return res.status(400).json({ error: `Unsupported resource: ${resource}` });

    return res.status(200).json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
