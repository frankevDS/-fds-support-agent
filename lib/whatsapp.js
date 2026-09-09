// WhatsApp Business Cloud API (Meta). Docs: developers.facebook.com/docs/whatsapp
function graphUrl(store) {
  return `https://graph.facebook.com/v20.0/${store.whatsapp_phone_number_id}/messages`;
}

function hasWhatsApp(store) {
  return !!(store.whatsapp_phone_number_id && store.whatsapp_access_token);
}

async function sendWhatsAppText(store, to, body) {
  if (!hasWhatsApp(store)) throw new Error('Store has no WhatsApp credentials');

  const res = await fetch(graphUrl(store), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${store.whatsapp_access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: true },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Parses an incoming Meta webhook payload down to the bits the chat
// handler needs. Returns null if the payload isn't a plain text message
// (e.g. it's a status update / delivery receipt, which the webhook
// should just acknowledge and ignore).
function parseIncomingMessage(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== 'text') return null;

    return {
      phoneNumberId: value.metadata?.phone_number_id,
      from: message.from, // customer's WhatsApp number
      text: message.text?.body || '',
      messageId: message.id,
    };
  } catch (err) {
    console.error('WhatsApp webhook parse error:', err.message);
    return null;
  }
}

module.exports = { sendWhatsAppText, parseIncomingMessage, hasWhatsApp };
