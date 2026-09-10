const { askGroq } = require('./groq');
const { searchKnowledgeBase, logConversation } = require('./supabase');
const { lookupOrder, searchProducts } = require('./woocommerce');
const { searchPublicPosts, searchPublicPages } = require('./wordpress');

const SYSTEM_PROMPT_TEMPLATE = (store) => `You are the customer support assistant for ${store.name}
(${store.domain}).

Rules:
- Only answer using the CONTEXT provided below. Never guess or use general knowledge
  about the topic beyond what's given.
- Be concise, warm, and professional.
- Never invent prices, order statuses, or delivery timelines.
- If someone asks about a specific order, only use the ORDER DATA provided; do not guess.
- LINKS COME FIRST. If anything in KNOWLEDGE BASE, SITE PAGES, BLOG POSTS, or PRODUCT
  DATA is relevant to the question, mention it briefly and include 1-2 of the real links
  provided so the visitor can read more (pricing pages, service pages, and blog posts are
  usually the most useful). Only ever use a URL that was actually given to you in the
  context below - never invent or guess one.
- WHATSAPP IS THE LAST RESORT. Only mention the SUPPORT_CONTACT WhatsApp number if
  NOTHING in KNOWLEDGE BASE, SITE PAGES, BLOG POSTS, or PRODUCT DATA is relevant to what
  they asked. If you already gave them a link, do not also push WhatsApp in the same
  answer - let them look first.
- If truly nothing in the context addresses what they're asking, that most likely means
  it isn't something offered - say so honestly rather than guessing, then offer the
  WhatsApp number (if provided) as the way to check directly.`;

function extractOrderQuery(message) {
  const orderNumberMatch = message.match(/#?(\d{3,6})/);
  const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (/order/i.test(message) && orderNumberMatch) return orderNumberMatch[1];
  if (/order/i.test(message) && emailMatch) return emailMatch[0];
  return null;
}

// Runs the full support pipeline (knowledge base + live site search +
// order/product lookups + Groq) for one incoming message and logs both
// sides of the conversation. Used identically by the website widget
// (api/chat.js) and WhatsApp (api/whatsapp/webhook.js) so behavior never
// drifts between channels.
async function getSupportReply(store, sessionId, message) {
  await logConversation({ storeId: store.id, sessionId, role: 'user', content: message });

  const contextParts = [];

  // Search everything in parallel - knowledge base, live WordPress pages/
  // posts, and WooCommerce products/orders - so the agent is drawing from
  // the real site, not just a small hand-maintained table.
  const [kbResults, pages, posts, orderResult, productResults] = await Promise.all([
    searchKnowledgeBase(store.id, message),
    searchPublicPages(store, message),
    searchPublicPosts(store, message),
    (() => {
      const orderQuery = extractOrderQuery(message);
      return orderQuery ? lookupOrder(store, orderQuery) : Promise.resolve(undefined);
    })(),
    /product|price|cost|plugin|prompt|service|website|design|develop/i.test(message)
      ? searchProducts(store, message)
      : Promise.resolve([]),
  ]);

  if (kbResults.length) {
    contextParts.push(
      'KNOWLEDGE BASE:\n' +
        kbResults
          .map((r) => `- ${r.title}: ${r.content}${r.url ? ` (More: ${r.url})` : ''}`)
          .join('\n')
    );
  }

  if (pages.length) {
    contextParts.push(
      'SITE PAGES:\n' +
        pages.map((p) => `- ${p.title}: ${p.excerpt} (Link: ${p.link})`).join('\n')
    );
  }

  if (posts.length) {
    contextParts.push(
      'BLOG POSTS:\n' +
        posts.map((p) => `- ${p.title}: ${p.excerpt} (Link: ${p.link})`).join('\n')
    );
  }

  if (orderResult !== undefined) {
    contextParts.push(
      orderResult
        ? `ORDER DATA:\n${JSON.stringify(orderResult).slice(0, 1500)}`
        : 'ORDER DATA: No matching order found.'
    );
  }

  if (productResults.length) {
    contextParts.push(
      'PRODUCT DATA:\n' +
        productResults.map((p) => `- ${p.name}: ${p.price} (Link: ${p.permalink})`).join('\n')
    );
  }

  // SUPPORT_CONTACT goes last, after everything else, so the model reads
  // it as the fallback it's meant to be, not the first thing it reaches for.
  if (store.support_whatsapp_number) {
    contextParts.push(`SUPPORT_CONTACT: WhatsApp ${store.support_whatsapp_number}`);
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT_TEMPLATE(store) },
    {
      role: 'system',
      content: contextParts.length
        ? contextParts.join('\n\n')
        : 'CONTEXT: (nothing relevant found anywhere on the site)',
    },
    { role: 'user', content: message },
  ];

  const reply = await askGroq(messages);
  await logConversation({ storeId: store.id, sessionId, role: 'assistant', content: reply });

  return reply;
}

module.exports = { getSupportReply };
