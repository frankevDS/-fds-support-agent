// Simple shared-secret check for the management/marketing endpoints.
// Good enough while it's just you operating this - replace with real
// per-user auth (e.g. Supabase Auth) before other people use this.
function requireAdmin(req, res) {
  const header = req.headers['x-admin-key'];
  if (!header || header !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
