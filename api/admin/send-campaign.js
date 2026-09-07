// Marketing campaign sends - email via Brevo, SMS via Africa's Talking.
// Requires the x-admin-key header. Deliberately separate from the
// customer-facing chat endpoint: nothing a customer types can ever
// trigger a broadcast to your list.
const { getStore } = require('../../lib/store');
const { sendEmail } = require('../../lib/brevo');
const { sendSms } = require('../../lib/africastalking');
const { requireAdmin } = require('../../lib/admin-auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { storeId, channel, to, subject, htmlContent, message } = req.body || {};
    if (!storeId || !channel || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: 'storeId, channel, and a non-empty to[] are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    let result;
    if (channel === 'email') {
      if (!subject || !htmlContent) {
        return res.status(400).json({ error: 'subject and htmlContent are required for email' });
      }
      result = await sendEmail(store, { to, subject, htmlContent });
    } else if (channel === 'sms') {
      if (!message) return res.status(400).json({ error: 'message is required for sms' });
      result = await sendSms(store, { to, message });
    } else {
      return res.status(400).json({ error: 'channel must be "email" or "sms"' });
    }

    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
