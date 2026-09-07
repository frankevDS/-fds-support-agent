// Groq exposes an OpenAI-compatible Chat Completions endpoint.
// Model roster changes often - check https://console.groq.com/docs/models
// and update GROQ_MODEL in your env vars if this one gets deprecated.
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

async function askGroq(messages) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      messages,
      temperature: 0.4,
      max_completion_tokens: 500,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { askGroq };
