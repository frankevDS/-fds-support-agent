// Returns the list of stores for the dashboard's store picker.
// Deliberately excludes every credential column - only id/name/domain,
// plus which integrations are configured (as booleans) so the dashboard
// can grey out tabs that aren't set up yet for a given store.
const { getSupabase } = require('../../lib/supabase');
const { requireAdmin } = require('../../lib/admin-auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('stores')
      .select(
        'id, name, domain, woocommerce_url, wp_url, brevo_api_key, africastalking_api_key'
      );
    if (error) throw new Error(error.message);

    const stores = (data || []).map((s) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      hasWooCommerce: !!s.woocommerce_url,
      hasWordPress: !!s.wp_url,
      hasBrevo: !!s.brevo_api_key,
      hasSms: !!s.africastalking_api_key,
    }));

    return res.status(200).json({ stores });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
