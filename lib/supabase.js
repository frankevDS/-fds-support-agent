const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return client;
}

// Keyword search over the knowledge_base table, scoped to one store, with
// relevance scoring rather than "first N rows that match any word." Good
// enough for a knowledge base under ~100 rows; move to pgvector semantic
// search beyond that (handles typos/synonyms, which plain keyword
// matching never fully will).
async function searchKnowledgeBase(storeId, query, limit = 4) {
  const supabase = getSupabase();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);

  if (words.length === 0) return [];

  const orFilter = words
    .map((w) => `content.ilike.%${w}%,title.ilike.%${w}%`)
    .join(',');

  // Pull a wider candidate set than we'll actually use, then rank them -
  // the DB only knows "matches at least one word," not "matches best."
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('title, content, url')
    .eq('store_id', storeId)
    .or(orFilter)
    .limit(Math.max(limit * 5, 20));

  if (error) {
    console.error('Supabase KB search error:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const scored = data.map((row) => {
    const haystack = `${row.title} ${row.content}`.toLowerCase();
    const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 1 : 0), 0);
    return { row, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}

async function logConversation({ storeId, sessionId, role, content }) {
  const supabase = getSupabase();
  const { error } = await supabase.from('conversations').insert({
    store_id: storeId,
    session_id: sessionId,
    role,
    content,
  });
  if (error) console.error('Supabase log error:', error.message);
}

// Checked BEFORE saving the new row, so it reflects prior visits only.
async function hasSeenEmailBefore(storeId, email) {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .ilike('email', email);
  if (error) {
    console.error('Supabase lead history check error:', error.message);
    return false;
  }
  return (count || 0) > 0;
}

async function saveLead({ storeId, sessionId, email }) {
  const supabase = getSupabase();
  const { error } = await supabase.from('leads').insert({
    store_id: storeId,
    session_id: sessionId,
    email,
  });
  if (error) console.error('Supabase lead save error:', error.message);
}

// Aggregated view for the dashboard: one row per unique email, with visit
// count and first/last seen, rather than a raw log of every chat opened.
async function listLeads(storeId, limit = 500) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('leads')
    .select('email, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Supabase lead list error:', error.message);
    return [];
  }

  const byEmail = new Map();
  for (const row of data || []) {
    const key = row.email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, { email: row.email, visits: 0, firstSeen: row.created_at, lastSeen: row.created_at });
    }
    const entry = byEmail.get(key);
    entry.visits += 1;
    entry.lastSeen = row.created_at;
  }

  return [...byEmail.values()].sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

module.exports = {
  getSupabase,
  searchKnowledgeBase,
  logConversation,
  hasSeenEmailBefore,
  saveLead,
  listLeads,
};
