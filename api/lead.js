const { saveLead, hasSeenEmailBefore } = require('../lib/supabase');
const { getStore } = require('../lib/store');

function setCors(res, store) {
  res.setHeader('Access-Control-Allow-Origin', store ? `https://${store.domain}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res, null);
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { storeId, sessionId, email } = req.body || {};
    if (!storeId || !sessionId || !email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'storeId, sessionId, and a valid email are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    setCors(res, store);

    const returning = await hasSeenEmailBefore(store.id, email);
    await saveLead({ storeId: store.id, sessionId, email });

    return res.status(200).json({ ok: true, returning });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
};
