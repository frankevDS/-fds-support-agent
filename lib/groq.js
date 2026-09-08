// Groq exposes an OpenAI-compatible Chat Completions endpoint.
// Groq retires models on a rolling basis and auto-routes old requests to a
// replacement for a grace period after decommissioning - but that grace
// period ends, so this module actively checks what's available instead of
// trusting a name you (or I) typed in once.
const CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

// If GROQ_MODEL is unset, or set to something no longer available, the
// agent auto-picks the best model from this list that your account
// actually has access to right now (checked via the /models endpoint).
// Ordered best-quality-first; production, non-"Enterprise/Contact Sales"
// models from console.groq.com/docs/models as of Sept 2026. Review this
// list occasionally - it's a sensible default, not a permanent truth.
const PREFERRED_MODELS = [
  'openai/gpt-oss-120b', // highest quality of the generally-available models
  'openai/gpt-oss-20b',  // fast and cheap - good default for a support bot
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

let modelsCache = { list: null, fetchedAt: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // re-check availability every 10 minutes

async function fetchAvailableModels() {
  const res = await fetch(MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Could not list Groq models (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

// Cached so we're not hitting /models on every single chat message -
// only once per 10-minute window per warm serverless instance.
async function getAvailableModelsCached() {
  const now = Date.now();
  if (modelsCache.list && now - modelsCache.fetchedAt < CACHE_TTL_MS) {
    return modelsCache.list;
  }
  try {
    const list = await fetchAvailableModels();
    modelsCache = { list, fetchedAt: now };
    return list;
  } catch (err) {
    console.warn('Groq: could not refresh model list, using last known list if any.', err.message);
    return modelsCache.list || null; // null = "couldn't check", not "nothing available"
  }
}

// Builds the ordered list of models to try: your explicit GROQ_MODEL and
// GROQ_FALLBACK_MODELS env vars first (if set), then PREFERRED_MODELS,
// filtered down to whatever your account actually has access to right
// now. If the availability check itself fails (network issue), falls
// back to trying your configured choices blind, same as before.
async function candidateModels() {
  const explicit = [process.env.GROQ_MODEL, ...(process.env.GROQ_FALLBACK_MODELS || '').split(',')]
    .map((m) => (m || '').trim())
    .filter(Boolean);
  const ordered = [...new Set([...explicit, ...PREFERRED_MODELS])];

  const available = await getAvailableModelsCached();
  if (!available) return ordered; // couldn't check - try in preference order anyway

  const usable = ordered.filter((m) => available.includes(m));
  return usable.length ? usable : ordered; // last resort: try anyway, error will be clear
}

// A model being gone shows up as a 400/404 with a message like
// "model_decommissioned" or "does not exist" - anything else (auth,
// rate limit, server error) should NOT trigger falling through to the
// next model, since retrying with a different model won't fix those.
function looksLikeMissingModel(status, bodyText) {
  if (status !== 400 && status !== 404) return false;
  return /decommission|does not exist|not found|no longer (?:available|supported)/i.test(bodyText);
}

async function callModel(model, messages) {
  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      max_completion_tokens: 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Groq API error (${res.status}) for model "${model}": ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function askGroq(messages) {
  const models = await candidateModels();
  let lastError;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const reply = await callModel(model, messages);
      if (i > 0) {
        console.warn(
          `Groq: model "${models[0]}" wasn't used, succeeded with "${model}" instead. ` +
            `This is automatic - no action needed unless you want to pin GROQ_MODEL explicitly.`
        );
      }
      return reply;
    } catch (err) {
      lastError = err;
      if (!looksLikeMissingModel(err.status, err.body || '')) throw err; // real error - don't mask it
    }
  }

  throw lastError || new Error('Groq: no usable models found on this account');
}

// Diagnostic used by /api/admin/model-health - shows what's configured,
// what's actually available, and what would be auto-selected right now.
async function listAvailableModels() {
  return fetchAvailableModels();
}

module.exports = { askGroq, listAvailableModels, candidateModels, PREFERRED_MODELS };
