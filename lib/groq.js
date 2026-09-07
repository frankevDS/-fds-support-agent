// Groq exposes an OpenAI-compatible Chat Completions endpoint.
// Groq retires models on a rolling basis (often with ~1-2 weeks notice by
// email) and auto-routes old requests to a replacement for a grace period
// after decommissioning - but that auto-routing eventually stops, so this
// module does its own fallback instead of relying on Groq's grace window.
const CHAT_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

// Checked in order. GROQ_MODEL (your primary pick) goes first, then
// GROQ_FALLBACK_MODELS (comma-separated, optional env var), then this
// hardcoded list as a last resort. Update this list occasionally by
// checking https://console.groq.com/docs/models - it's a safety net,
// not the primary mechanism.
const HARDCODED_FALLBACKS = ['openai/gpt-oss-20b', 'llama-3.1-8b-instant'];

function candidateModels() {
  const primary = process.env.GROQ_MODEL;
  const fallbacks = (process.env.GROQ_FALLBACK_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks, ...HARDCODED_FALLBACKS].filter(Boolean))];
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
  const models = candidateModels();
  let lastError;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const reply = await callModel(model, messages);
      if (i > 0) {
        // We only reach here after a fallback succeeded - surface it in
        // logs so you notice and update GROQ_MODEL, rather than silently
        // running on a fallback indefinitely.
        console.warn(
          `Groq: model "${models[0]}" failed, succeeded with fallback "${model}". ` +
            `Update GROQ_MODEL in your environment variables.`
        );
      }
      return reply;
    } catch (err) {
      lastError = err;
      if (!looksLikeMissingModel(err.status, err.body || '')) throw err; // real error - don't mask it
      // otherwise, try the next candidate model
    }
  }

  throw lastError || new Error('Groq: no models configured');
}

// Optional diagnostic - lists models currently available on your account,
// so you can check GROQ_MODEL against reality without leaving your code.
// Not called automatically; wire it into an admin endpoint or run it
// manually if you want a health check.
async function listAvailableModels() {
  const res = await fetch(MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Could not list Groq models (${res.status})`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

module.exports = { askGroq, listAvailableModels };
