// Quick health check: what model is the agent actually using right now,
// and what's available on your account? Run this after any Groq
// deprecation email, or just check it periodically.
const { requireAdmin } = require('../../lib/admin-auth');
const { listAvailableModels, candidateModels, PREFERRED_MODELS } = require('../../lib/groq');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const available = await listAvailableModels();
    const wouldTryInOrder = await candidateModels();

    return res.status(200).json({
      currentlyAutoSelected: wouldTryInOrder[0] || null,
      configuredModel: process.env.GROQ_MODEL || '(not set - using auto-selection)',
      fallbackOrder: wouldTryInOrder,
      preferredModelList: PREFERRED_MODELS,
      allAvailableModels: available,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
