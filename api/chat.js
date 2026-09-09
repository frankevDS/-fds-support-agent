const { getStore } = require('../lib/store');
const { getSupportReply } = require('../lib/support-agent');

function setCors(res, store) {
  res.setHeader('Access-Control-Allow-Origin', store ? `https://${store.domain}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCors(res, null);
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { message, sessionId, storeId } = req.body || {};
    if (!message || !sessionId || !storeId) {
      return res.status(400).json({ error: 'message, sessionId, and storeId are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    setCors(res, store);

    const reply = await getSupportReply(store, sessionId, message);
    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
