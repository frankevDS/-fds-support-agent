// Quick health check: is GROQ_MODEL still a real, available model on
// your Groq account? Run this after any Groq deprecation email, or just
// check it periodically - visiting this URL in a browser with the
// x-admin-key header (or via curl) tells you before your customers do.
const { requireAdmin } = require('../../lib/admin-auth');
const { listAvailableModels } = require('../../lib/groq');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const available = await listAvailableModels();
    const configured = process.env.GROQ_MODEL;
    const fallbacks = (process.env.GROQ_FALLBACK_MODELS || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    return res.status(200).json({
      configuredModel: configured,
      configuredModelStillAvailable: available.includes(configured),
      fallbackModels: fallbacks,
      fallbacksStillAvailable: fallbacks.filter((m) => available.includes(m)),
      allAvailableModels: available,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
