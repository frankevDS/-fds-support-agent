// WhatsApp Business Cloud API webhook. One shared URL across every store -
// set this as the Webhook URL in your Meta App, once. Meta requires a
// GET (for one-time verification against ANY store's verify token) and a
// POST (for actual incoming messages, matched to a store by phone_number_id).
const { getSupabase } = require('../../lib/supabase');
const { getStoreByWhatsAppPhoneId } = require('../../lib/store');
const { sendWhatsAppText, parseIncomingMessage } = require('../../lib/whatsapp');
const { getSupportReply } = require('../../lib/support-agent');

async function isKnownVerifyToken(token) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stores')
    .select('id')
    .eq('whatsapp_verify_token', token)
    .maybeSingle();
  if (error) {
    console.error('WhatsApp verify-token lookup error:', error.message);
    return false;
  }
  return !!data;
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token && (await isKnownVerifyToken(token))) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verification failed');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsed = parseIncomingMessage(req.body);
    // Not a plain text message (e.g. a delivery/read status update) -
    // acknowledge and do nothing, per Meta's webhook expectations.
    if (!parsed) return res.status(200).json({ ok: true });

    const store = await getStoreByWhatsAppPhoneId(parsed.phoneNumberId);
    if (!store) {
      console.warn(`WhatsApp message received for unknown phone_number_id: ${parsed.phoneNumberId}`);
      return res.status(200).json({ ok: true }); // ack anyway - Meta will retry otherwise
    }

    const sessionId = `whatsapp:${parsed.from}`;
    const reply = await getSupportReply(store, sessionId, parsed.text);
    await sendWhatsAppText(store, parsed.from, reply);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    // Still 200 - returning an error status makes Meta retry the same
    // webhook repeatedly, which usually makes things worse, not better.
    return res.status(200).json({ ok: false });
  }
};
