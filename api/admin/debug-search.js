// Diagnostic tool: shows exactly what the live-site search sees for a
// given question - whether the WordPress REST API is reachable at all,
// what it returns for pages/posts, whether WooCommerce credentials are
// configured, and what products it finds. Use this whenever the agent
// isn't surfacing a link you expect it to.
const { getStore } = require('../../lib/store');
const { requireAdmin } = require('../../lib/admin-auth');
const { diagnoseSiteSearch, searchPublicPages, searchPublicPosts } = require('../../lib/wordpress');
const { searchProducts } = require('../../lib/woocommerce');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { storeId, query } = req.body || {};
    if (!storeId || !query) {
      return res.status(400).json({ error: 'storeId and query are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    const [rawDiagnostics, finalPages, finalPosts, finalProducts] = await Promise.all([
      diagnoseSiteSearch(store, query),
      searchPublicPages(store, query),
      searchPublicPosts(store, query),
      searchProducts(store, query),
    ]);

    return res.status(200).json({
      wordpressRestApi: rawDiagnostics,
      whatTheAgentWouldActuallyUse: {
        pages: finalPages,
        posts: finalPosts,
        products: finalProducts,
      },
      wooCommerceConfigured: !!(store.woocommerce_url && store.woocommerce_consumer_key),
      wpUrlBeingUsed: store.wp_url || `https://${store.domain} (fallback - wp_url not set on this store)`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
