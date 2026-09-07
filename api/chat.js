const { askGroq } = require('../lib/groq');
const { searchKnowledgeBase, logConversation } = require('../lib/supabase');
const { lookupOrder, searchProducts } = require('../lib/woocommerce');
const { getStore } = require('../lib/store');

const SYSTEM_PROMPT_TEMPLATE = (store) => `You are the customer support assistant for ${store.name}
(${store.domain}).

Rules:
- Only answer using the CONTEXT provided below. If the context doesn't cover the
  question, say you're not sure and offer to connect them with the team.
- Be concise, warm, and professional.
- Never invent prices, order statuses, or delivery timelines.
- If someone asks about a specific order, only use the ORDER DATA provided; do not guess.`;

function setCors(res, store) {
  res.setHeader('Access-Control-Allow-Origin', store ? `https://${store.domain}` : '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function extractOrderQuery(message) {
  const orderNumberMatch = message.match(/#?(\d{3,6})/);
  const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (/order/i.test(message) && orderNumberMatch) return orderNumberMatch[1];
  if (/order/i.test(message) && emailMatch) return emailMatch[0];
  return null;
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

    await logConversation({ storeId: store.id, sessionId, role: 'user', content: message });

    const contextParts = [];

    const kbResults = await searchKnowledgeBase(store.id, message);
    if (kbResults.length) {
      contextParts.push(
        'KNOWLEDGE BASE:\n' + kbResults.map((r) => `- ${r.title}: ${r.content}`).join('\n')
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

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
