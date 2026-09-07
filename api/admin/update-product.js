// Store management actions - stock and price updates.
// Requires the x-admin-key header (see lib/admin-auth.js). Never called
// from the customer-facing widget - this is for you (or a future internal
// dashboard) to drive, or to let the agent take an action only after a
// human has reviewed and approved it.
const { getStore } = require('../../lib/store');
const { updateProductStock, updateProductPrice } = require('../../lib/woocommerce');
const { requireAdmin } = require('../../lib/admin-auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { storeId, productId, stockQuantity, regularPrice } = req.body || {};
    if (!storeId || !productId) {
      return res.status(400).json({ error: 'storeId and productId are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    const results = {};
    if (stockQuantity !== undefined) {
      results.stock = await updateProductStock(store, productId, stockQuantity);
    }
    if (regularPrice !== undefined) {
      results.price = await updateProductPrice(store, productId, regularPrice);
    }

    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
