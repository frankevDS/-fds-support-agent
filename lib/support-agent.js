const { askGroq } = require('./groq');
const { searchKnowledgeBase, logConversation } = require('./supabase');
const { lookupOrder, searchProducts } = require('./woocommerce');

const SYSTEM_PROMPT_TEMPLATE = (store) => `You are the customer support assistant for ${store.name}
(${store.domain}).

Rules:
- Only answer using the CONTEXT provided below. If the context doesn't cover the
  question, do NOT guess or use general knowledge about the topic.
- Be concise, warm, and professional.
- Never invent prices, order statuses, or delivery timelines.
- If someone asks about a specific order, only use the ORDER DATA provided; do not guess.
- If a KNOWLEDGE BASE entry you used includes a "More:" link, include that exact URL
  at the end of your answer as a plain link (e.g. "More: https://..."), so the visitor
  can read further. Only include a link that was actually provided - never invent one.
- If the context doesn't cover the question: tell the visitor you'll get back to them
  shortly, and if a SUPPORT_CONTACT line is present below, also invite them to WhatsApp
  that number for an immediate answer. Never invent a phone number if none is provided.`;

function extractOrderQuery(message) {
  const orderNumberMatch = message.match(/#?(\d{3,6})/);
  const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (/order/i.test(message) && orderNumberMatch) return orderNumberMatch[1];
  if (/order/i.test(message) && emailMatch) return emailMatch[0];
  return null;
}

// Runs the full support pipeline (knowledge base + order/product lookups +
// Groq) for one incoming message and logs both sides of the conversation.
// Used identically by the website widget (api/chat.js) and WhatsApp
// (api/whatsapp/webhook.js) so behavior never drifts between channels.
async function getSupportReply(store, sessionId, message) {
  await logConversation({ storeId: store.id, sessionId, role: 'user', content: message });

  const contextParts = [];

  if (store.support_whatsapp_number) {
    contextParts.push(`SUPPORT_CONTACT: WhatsApp ${store.support_whatsapp_number}`);
  }

  const kbResults = await searchKnowledgeBase(store.id, message);
  if (kbResults.length) {
    contextParts.push(
      'KNOWLEDGE BASE:\n' +
        kbResults
          .map((r) => `- ${r.title}: ${r.content}${r.url ? ` (More: ${r.url})` : ''}`)
          .join('\n')
    );
  }

  const orderQuery = extractOrderQuery(message);
  if (orderQuery) {
    const order = await lookupOrder(store, orderQuery);
    contextParts.push(
      order
        ? `ORDER DATA:\n${JSON.stringify(order).slice(0, 1500)}`
        : 'ORDER DATA: No matching order found.'
    );
  }

  if (/product|price|cost|plugin|prompt|service/i.test(message)) {
    const products = await searchProducts(store, message);
    if (products.length) {
      contextParts.push(
        'PRODUCT DATA:\n' +
          products.map((p) => `- ${p.name}: ${p.price} (${p.permalink})`).join('\n')
      );
    }
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT_TEMPLATE(store) },
    {
      role: 'system',
      content: contextParts.length
        ? contextParts.join('\n\n')
        : 'CONTEXT: (none found - answer generally and offer to connect them with the team)',
    },
    { role: 'user', content: message },
  ];

  const reply = await askGroq(messages);
  await logConversation({ storeId: store.id, sessionId, role: 'assistant', content: reply });

  return reply;
}

module.exports = { getSupportReply };
